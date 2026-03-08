import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { GatewayConfig } from '../config.js';
import { TokenUsageAccumulator, estimateTokens } from './token-usage.js';

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

interface AgentEvent {
	runId: string;
	stream: string;
	data: Record<string, unknown>;
	sessionKey: string;
	seq: number;
	ts: number;
}

type AgentEventHandler = (event: AgentEvent) => void;
const runHandlers = new Map<string, AgentEventHandler>();

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
								scopes: ['operator.admin'],
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
					return;
				}

				// Handle agent events — dispatch to run handlers
				if (msg.type === 'event' && msg.event === 'agent' && msg.payload) {
					const payload = msg.payload as AgentEvent;
					const handler = runHandlers.get(payload.runId);
					if (handler) handler(payload);
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
 * Send a message to the agent via WebSocket RPC and stream the response.
 * Returns the final complete text.
 */
export function sendToAgent(opts: SendOptions): Promise<string> {
	if (!connected || !agentWs) {
		return Promise.reject(new Error('Agent not connected'));
	}

	const ws = agentWs;
	const sessionKey = `agent:main:web:${opts.userId}:${opts.sessionId}`;

	return new Promise<string>((resolve, reject) => {
		const reqId = randomUUID();
		let timeout: ReturnType<typeof setTimeout> | null = null;
		const idleTimeoutMs = opts.timeoutMs ?? 120_000;
		const ERROR_IDLE_TIMEOUT_MS = 15_000;
		const usageAccumulator = new TokenUsageAccumulator();
		const estimatedInputTokens = estimateTokens(opts.message);
		let usageReported = false;
		let runId: string | null = null;
		let finalText = '';
		let lastError: string | null = null;

		const reportUsage = (status: AgentRunUsage['status']) => {
			if (usageReported) return;
			usageReported = true;

			const summary = usageAccumulator.summarize();
			const estimatedOutputTokens = estimateTokens(finalText);
			const providerInputTokens = summary.providerInputTokens;
			const providerOutputTokens = summary.providerOutputTokens;
			const providerTotalTokens = summary.providerTotalTokens;
			const inputTokens = providerInputTokens > 0 ? providerInputTokens : estimatedInputTokens;
			const outputTokens = providerOutputTokens > 0 ? providerOutputTokens : estimatedOutputTokens;
			const totalTokens =
				providerTotalTokens > 0 ? providerTotalTokens : inputTokens + outputTokens;

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
					modelCalls: summary.modelCalls,
					usageEvents: summary.usageEvents,
					toolCalls: summary.toolCalls,
					streamCounts: summary.streamCounts
				});
			}
		};

		const resetIdleTimeout = (customMs?: number) => {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => {
				runHandlers.delete(reqId);
				responseHandlers.delete(reqId);
				if (runId) runHandlers.delete(runId);
				const status = lastError ? 'error' as const : 'timeout' as const;
				reportUsage(status);
				reject(new Error(lastError
					? `Agent error: ${lastError}`
					: 'Agent response timeout'));
			}, customMs ?? idleTimeoutMs);
		};
		resetIdleTimeout();
		let lastProgress: string | null = null;

		// Register event handler for agent events on this run
		const onAgentEvent = (event: AgentEvent) => {
			usageAccumulator.addEvent(event.stream, event.data);

			const isLifecycleError =
				event.stream === 'lifecycle' && event.data?.phase === 'error';

			if (isLifecycleError && typeof event.data?.error === 'string') {
				lastError = event.data.error;
			}

			// Shorten idle timeout after lifecycle errors so we fail fast
			// instead of waiting the full 120s when the agent has given up
			resetIdleTimeout(isLifecycleError ? ERROR_IDLE_TIMEOUT_MS : undefined);

			if (event.stream === 'assistant' && event.data) {
				const delta = event.data.delta as string | undefined;
				if (delta && opts.onDelta) opts.onDelta(delta);
				if (event.data.text) finalText = event.data.text as string;
			}

			if (event.stream !== 'assistant' && opts.onProgress) {
				const lifecyclePhase =
					event.stream === 'lifecycle' && typeof event.data?.phase === 'string'
						? event.data.phase
						: null;
				const errorDetail =
					isLifecycleError && typeof event.data?.error === 'string'
						? event.data.error
						: null;
				const toolName =
					typeof event.data?.toolName === 'string'
						? event.data.toolName
						: typeof event.data?.name === 'string'
							? event.data.name
							: null;

				let progress: string;
				if (errorDetail) {
					progress = `[error] ${errorDetail}`;
				} else if (lifecyclePhase) {
					progress = `[${lifecyclePhase}]`;
				} else if (toolName) {
					progress = `[tool] ${toolName}`;
				} else {
					progress = `[${event.stream}]`;
				}

				if (progress !== lastProgress) {
					lastProgress = progress;
					opts.onProgress(progress);
				}
			}

			if (event.stream === 'lifecycle' && event.data?.phase === 'end') {
				if (timeout) clearTimeout(timeout);
				if (runId) runHandlers.delete(runId);
				reportUsage('completed');
				resolve(finalText);
			}
		};

		// Register response handler for the chat.send RPC
		responseHandlers.set(reqId, (res) => {
			if (!res.ok) {
				if (timeout) clearTimeout(timeout);
				reportUsage('error');
				reject(new Error(res.error?.message ?? 'chat.send failed'));
				return;
			}
			resetIdleTimeout();
			runId = (res.payload?.runId as string) ?? null;
			if (runId) {
				runHandlers.set(runId, onAgentEvent);
			}
		});

		ws.send(
			JSON.stringify({
				type: 'req',
				id: reqId,
				method: 'chat.send',
				params: {
					message: opts.message,
					idempotencyKey: randomUUID(),
					sessionKey
				}
			})
		);
	});
}
