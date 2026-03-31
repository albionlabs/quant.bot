import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { GatewayConfig } from '../config.js';
import { estimateTokens } from './token-usage.js';

let agentWs: WebSocket | null = null;
let connected = false;
let savedConfig: GatewayConfig | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

type ResHandler = (msg: {
	ok: boolean;
	payload?: Record<string, unknown>;
	error?: { code: string; message: string };
}) => void;
const responseHandlers = new Map<string, ResHandler>();

export function isAgentConnected(): boolean {
	return connected;
}

function scheduleReconnect(): void {
	if (reconnectTimer || !savedConfig) return;
	console.log(`[agent-proxy] reconnecting in ${reconnectDelay}ms`);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectToAgent(savedConfig!).catch(() => {});
	}, reconnectDelay);
	reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

export function connectToAgent(config: GatewayConfig): Promise<void> {
	const isReconnect = savedConfig !== null;
	savedConfig = config;

	return new Promise<void>((resolve, reject) => {
		const ws = new WebSocket(config.agentWsUrl);
		agentWs = ws;

		const fail = (err: Error) => {
			connected = false;
			agentWs = null;
			if (!isReconnect) reject(err);
			scheduleReconnect();
		};

		ws.on('message', (raw) => {
			try {
				const msg = JSON.parse(raw.toString());

				// Handle connect.challenge — perform auth handshake
				if (msg.type === 'event' && msg.event === 'connect.challenge') {
					const id = randomUUID();
					responseHandlers.set(id, (res) => {
						if (res.ok) {
							reconnectDelay = 1000;
							connected = true;
							console.log('[agent-proxy] connected to openclaw agent');
							resolve();
						} else {
							fail(new Error(res.error?.message ?? 'Auth failed'));
						}
					});
					ws.send(
						JSON.stringify({
							type: 'req',
							id,
							method: 'connect',
							params: {
								minProtocol: 3,
								maxProtocol: 3,
								client: {
									id: 'node-host',
									version: '2026.2.27',
									platform: 'linux',
									mode: 'backend',
									displayName: 'Quant Bot Gateway'
								},
								role: 'operator',
								scopes: ['operator.admin', 'operator.write'],
								caps: [],
								auth: {
									token: config.openclawGatewayToken
								}
							}
						})
					);
					return;
				}

				// Handle response frames
				if (msg.type === 'res' && msg.id) {
					const handler = responseHandlers.get(msg.id);
					if (handler) {
						responseHandlers.delete(msg.id);
						handler(msg);
					}
				}
			} catch {
				// ignore malformed messages
			}
		});

		ws.on('close', () => {
			connected = false;
			agentWs = null;
			console.log('[agent-proxy] disconnected from agent');
			scheduleReconnect();
		});

		ws.on('error', (err) => {
			console.error('[agent-proxy] ws error:', err.message);
			fail(err);
		});
	});
}

export interface SendOptions {
	message: string;
	userId: string;
	sessionId: string;
	onDelta?: (delta: string) => void;
	onProgress?: (progress: string) => void;
	onUsage?: (usage: AgentRunUsage) => void;
	timeoutMs?: number;
}

export interface AgentRunUsage {
	status: 'completed' | 'timeout' | 'error';
	promptChars: number;
	completionChars: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	providerInputTokens: number;
	providerOutputTokens: number;
	providerTotalTokens: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	modelCalls: number;
	usageEvents: number;
	toolCalls: Record<string, number>;
	streamCounts: Record<string, number>;
}

/**
 * Send a message to the agent via the OpenAI-compatible HTTP API with
 * SSE streaming. This bypasses the WebSocket operator.write scope
 * requirement while still delivering real-time deltas.
 */
export async function sendToAgent(opts: SendOptions): Promise<string> {
	if (!connected || !savedConfig) {
		throw new Error('Agent not connected');
	}

	const config = savedConfig;
	const estimatedInputTokens = estimateTokens(opts.message);
	let finalText = '';
	let usageReported = false;

	const reportUsage = (status: AgentRunUsage['status'], providerUsage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	}) => {
		if (usageReported) return;
		usageReported = true;

		const estimatedOutputTokens = estimateTokens(finalText);
		const providerInputTokens = providerUsage?.prompt_tokens ?? 0;
		const providerOutputTokens = providerUsage?.completion_tokens ?? 0;
		const providerTotalTokens = providerUsage?.total_tokens ?? 0;
		const inputTokens = providerInputTokens > 0 ? providerInputTokens : estimatedInputTokens;
		const outputTokens = providerOutputTokens > 0 ? providerOutputTokens : estimatedOutputTokens;
		const totalTokens = providerTotalTokens > 0 ? providerTotalTokens : inputTokens + outputTokens;

		if (opts.onUsage) {
			opts.onUsage({
				status,
				promptChars: opts.message.length,
				completionChars: finalText.length,
				inputTokens,
				outputTokens,
				totalTokens,
				providerInputTokens,
				providerOutputTokens,
				providerTotalTokens,
				estimatedInputTokens,
				estimatedOutputTokens,
				modelCalls: 1,
				usageEvents: 0,
				toolCalls: {},
				streamCounts: {}
			});
		}
	};

	// Derive HTTP URL from WebSocket URL
	const httpUrl = config.agentWsUrl
		.replace(/^ws:/, 'http:')
		.replace(/^wss:/, 'https:');

	const sessionKey = `agent:main:web:${opts.userId}:${opts.sessionId}`;

	if (opts.onProgress) opts.onProgress('Thinking…');

	const res = await fetch(`${httpUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.openclawGatewayToken}`
		},
		body: JSON.stringify({
			model: 'openclaw:main',
			messages: [{ role: 'user', content: opts.message }],
			user: sessionKey,
			stream: true
		}),
		signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000)
	});

	if (!res.ok) {
		const text = await res.text();
		reportUsage('error');
		throw new Error(`Agent HTTP error ${res.status}: ${text}`);
	}

	if (!res.body) {
		reportUsage('error');
		throw new Error('No response body from agent');
	}

	// Parse SSE stream
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let providerUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6).trim();
				if (data === '[DONE]') continue;

				try {
					const chunk = JSON.parse(data) as {
						choices?: Array<{ delta?: { content?: string } }>;
						usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
					};

					const delta = chunk.choices?.[0]?.delta?.content;
					if (delta) {
						finalText += delta;
						if (opts.onDelta) opts.onDelta(delta);
					}

					if (chunk.usage) {
						providerUsage = chunk.usage;
					}
				} catch {
					// ignore malformed SSE chunks
				}
			}
		}
	} catch (err) {
		reportUsage('error');
		throw err;
	}

	if (!finalText) {
		reportUsage('error');
		throw new Error('No response content from agent');
	}

	reportUsage('completed', providerUsage);
	return finalText;
}
