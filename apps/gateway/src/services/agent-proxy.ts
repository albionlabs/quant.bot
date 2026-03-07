import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { GatewayConfig } from '../config.js';

let agentWs: WebSocket | null = null;
let connected = false;
let savedConfig: GatewayConfig | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

type ResHandler = (msg: { ok: boolean; payload?: Record<string, unknown>; error?: { code: string; message: string } }) => void;
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
					ws.send(JSON.stringify({
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
					}));
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
	onDelta?: (delta: string) => void;
	onProgress?: (progress: string) => void;
	timeoutMs?: number;
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
	const sessionKey = `agent:main:web:${opts.userId}`;

	return new Promise<string>((resolve, reject) => {
		const reqId = randomUUID();
		let timeout: ReturnType<typeof setTimeout> | null = null;
		const idleTimeoutMs = opts.timeoutMs ?? 120_000;
		const resetIdleTimeout = () => {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => {
				runHandlers.delete(reqId);
				responseHandlers.delete(reqId);
				if (runId) runHandlers.delete(runId);
				reject(new Error('Agent response timeout'));
			}, idleTimeoutMs);
		};
		resetIdleTimeout();

		let runId: string | null = null;
		let finalText = '';
		let lastProgress: string | null = null;

		// Register event handler for agent events on this run
		const onAgentEvent = (event: AgentEvent) => {
			resetIdleTimeout();

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
				const toolName =
					typeof event.data?.toolName === 'string'
						? event.data.toolName
						: typeof event.data?.name === 'string'
							? event.data.name
							: null;

				let progress: string;
				if (lifecyclePhase) {
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
				resolve(finalText);
			}
		};

		// Register response handler for the chat.send RPC
		responseHandlers.set(reqId, (res) => {
			if (!res.ok) {
				if (timeout) clearTimeout(timeout);
				reject(new Error(res.error?.message ?? 'chat.send failed'));
				return;
			}
			resetIdleTimeout();
			runId = (res.payload?.runId as string) ?? null;
			if (runId) {
				runHandlers.set(runId, onAgentEvent);
			}
		});

		ws.send(JSON.stringify({
			type: 'req',
			id: reqId,
			method: 'chat.send',
			params: {
				message: opts.message,
				idempotencyKey: randomUUID(),
				sessionKey
			}
		}));
	});
}
