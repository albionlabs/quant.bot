import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import type { GatewayConfig } from '../config.js';
import { estimateTokens } from './token-usage.js';
import { loadOrCreateIdentity, buildDeviceAuth, type DeviceIdentity } from './device-identity.js';

let agentWs: WebSocket | null = null;
let connected = false;
let savedConfig: GatewayConfig | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

let deviceIdentity: DeviceIdentity | null = null;

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

// Buffer events that arrive before their run handler is registered
const unclaimedEvents = new Map<string, AgentEvent[]>();

export function isAgentConnected(): boolean {
	return connected;
}

function dispatchAgentEvent(payload: AgentEvent): void {
	const handler = runHandlers.get(payload.runId);
	if (handler) {
		handler(payload);
	} else {
		const buf = unclaimedEvents.get(payload.runId) ?? [];
		buf.push(payload);
		unclaimedEvents.set(payload.runId, buf);
	}
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

	// Load or create device identity (persisted to volume on Fly, ~/.openclaw locally)
	if (!deviceIdentity) {
		const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw');
		deviceIdentity = loadOrCreateIdentity(join(stateDir, 'gateway-device.json'));
	}
	const identity = deviceIdentity;

	return new Promise<void>((resolve, reject) => {
		// Host: localhost ensures OpenClaw treats the socat-proxied connection as local
		const ws = new WebSocket(config.agentWsUrl, { headers: { Host: 'localhost' } });
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

				// Handle connect.challenge — perform auth + device identity handshake
				if (msg.type === 'event' && msg.event === 'connect.challenge') {
					const nonce = msg.payload?.nonce as string;
					if (!nonce) {
						console.error('[agent-proxy] connect.challenge missing nonce', JSON.stringify(msg));
						fail(new Error('Missing challenge nonce'));
						return;
					}

					const scopes = ['operator.admin'];
					const device = buildDeviceAuth(identity, {
						clientId: 'gateway-client',
						clientMode: 'backend',
						role: 'operator',
						scopes,
						nonce,
						token: config.openclawGatewayToken,
						platform: 'linux'
					});

					const id = randomUUID();
					responseHandlers.set(id, (res) => {
						if (res.ok) {
							reconnectDelay = 1000;
							connected = true;
							const resScopes = (res.payload as Record<string, unknown>)?.scopes;
							console.log(`[agent-proxy] connected to openclaw agent (scopes: ${Array.isArray(resScopes) ? resScopes.join(', ') : 'n/a'}, device: ${identity.deviceId.slice(0, 12)}…)`);
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
									id: 'gateway-client',
									version: '2026.2.27',
									platform: 'linux',
									mode: 'backend',
									displayName: 'Quant Bot Gateway'
								},
								role: 'operator',
								scopes,
								caps: ['tool-events'],
								auth: {
									token: config.openclawGatewayToken
								},
								device
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
					dispatchAgentEvent(msg.payload as AgentEvent);
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

export function disconnectAgent(): void {
	if (agentWs) {
		agentWs.close();
		agentWs = null;
		connected = false;
	}
}

function sendRequest<T = Record<string, unknown>>(
	method: string,
	params: unknown,
	timeoutMs: number
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		if (!agentWs || !connected) {
			reject(new Error('Agent not connected'));
			return;
		}

		const id = randomUUID();
		const timer = setTimeout(() => {
			responseHandlers.delete(id);
			reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		responseHandlers.set(id, (res) => {
			clearTimeout(timer);
			if (res.ok) {
				resolve((res.payload ?? {}) as T);
			} else {
				reject(new Error(res.error?.message ?? `${method} failed`));
			}
		});

		agentWs.send(JSON.stringify({ type: 'req', id, method, params }));
	});
}

export interface SendOptions {
	message: string;
	userId: string;
	sessionId: string;
	onDelta?: (delta: string) => void;
	onProgress?: (progress: string) => void;
	onToolCall?: (name: string, args: Record<string, unknown>) => void;
	onToolResult?: (name: string, result: unknown) => void;
	onError?: (error: string) => void;
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

export async function sendToAgent(opts: SendOptions): Promise<string> {
	if (!connected || !agentWs) {
		throw new Error('Agent not connected');
	}

	const estimatedInputTokens = estimateTokens(opts.message);
	let finalText = '';
	let usageReported = false;
	const toolCallCounts: Record<string, number> = {};
	const streamCounts: Record<string, number> = {};
	let modelCalls = 0;
	let usageEventsCount = 0;
	let providerUsage: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	} | undefined;

	const reportUsage = (status: AgentRunUsage['status']) => {
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
				modelCalls,
				usageEvents: usageEventsCount,
				toolCalls: toolCallCounts,
				streamCounts
			});
		}
	};

	const sessionKey = `agent:main:web:${opts.userId}:${opts.sessionId}`;
	const idempotencyKey = randomUUID();
	const timeoutMs = opts.timeoutMs ?? 120_000;

	if (opts.onProgress) opts.onProgress('Thinking\u2026');

	// Send chat.send RPC — returns { runId } once agent accepts
	const result = await sendRequest<{ runId: string; state?: string; message?: string }>(
		'chat.send',
		{ sessionKey, message: opts.message, idempotencyKey },
		timeoutMs
	);

	const runId = result.runId;

	// If the response already contains a final message (non-streaming), return directly
	if (result.state === 'final' && result.message) {
		reportUsage('completed');
		return result.message;
	}

	// Claim any events that arrived before we set up the handler
	const buffered = unclaimedEvents.get(runId) ?? [];
	unclaimedEvents.delete(runId);

	return new Promise<string>((resolve, reject) => {
		let done = false;

		const timer = setTimeout(() => {
			if (!done) {
				done = true;
				runHandlers.delete(runId);
				unclaimedEvents.delete(runId);
				reportUsage('timeout');
				reject(new Error('Agent response timed out'));
			}
		}, timeoutMs);

		const finish = (status: AgentRunUsage['status'], err?: Error) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			runHandlers.delete(runId);
			unclaimedEvents.delete(runId);

			if (err) {
				reportUsage(status);
				reject(err);
			} else if (!finalText) {
				reportUsage('error');
				reject(new Error('No response content from agent'));
			} else {
				reportUsage(status);
				resolve(finalText);
			}
		};

		const processEvent = (event: AgentEvent) => {
			if (done) return;
			streamCounts[event.stream] = (streamCounts[event.stream] ?? 0) + 1;

			switch (event.stream) {
				case 'delta':
				case 'assistant': {
					const text = (event.data.delta ?? event.data.text ?? event.data.content ?? '') as string;
					if (text) {
						finalText += text;
						if (opts.onDelta) opts.onDelta(text);
					}
					break;
				}
				case 'tool_call':
				case 'tool-call': {
					const name = event.data.name as string;
					const args = (event.data.args ?? event.data.input ?? {}) as Record<string, unknown>;
					toolCallCounts[name] = (toolCallCounts[name] ?? 0) + 1;
					modelCalls++;
					if (opts.onToolCall) opts.onToolCall(name, args);
					break;
				}
				case 'tool_result':
				case 'tool-result': {
					const name = event.data.name as string;
					const res = event.data.result ?? event.data.output;
					if (opts.onToolResult) opts.onToolResult(name, res);
					break;
				}
				case 'lifecycle': {
					const phase = (event.data.phase ?? event.data.status ?? event.data.event ?? '') as string;
					if (phase === 'end') {
						finish('completed');
					} else if (phase && opts.onProgress) {
						opts.onProgress(phase);
					}
					break;
				}
				case 'usage': {
					usageEventsCount++;
					if (event.data.prompt_tokens !== undefined) {
						providerUsage = {
							prompt_tokens: event.data.prompt_tokens as number,
							completion_tokens: event.data.completion_tokens as number,
							total_tokens: event.data.total_tokens as number
						};
					}
					break;
				}
				case 'final': {
					const text = (event.data.text ?? event.data.content ?? '') as string;
					if (text && !finalText) finalText = text;
					finish('completed');
					break;
				}
				case 'error':
				case 'aborted': {
					const msg = (event.data.message ?? event.data.error ?? 'Agent error') as string;
					if (opts.onError) opts.onError(msg);
					finish('error', new Error(msg));
					break;
				}
				default:
					console.log(`[agent-proxy] unhandled stream: ${event.stream}`, JSON.stringify(event.data));
			}
		};

		// Register handler and replay buffered events
		runHandlers.set(runId, processEvent);
		for (const evt of buffered) processEvent(evt);
	});
}
