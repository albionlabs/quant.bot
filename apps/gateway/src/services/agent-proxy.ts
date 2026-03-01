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

// Track pending agent runs: runId → { text, resolve, reject, timer }
interface PendingRun {
	text: string;
	resolve: (text: string) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}
const pendingRuns = new Map<string, PendingRun>();

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

function handleEvent(msg: { event: string; payload?: Record<string, unknown> }): void {
	if (msg.event !== 'agent' || !msg.payload) return;

	const runId = msg.payload.runId as string | undefined;
	if (!runId) return;

	const run = pendingRuns.get(runId);
	if (!run) return;

	const stream = msg.payload.stream as string | undefined;

	// Accumulate assistant text (each event contains the full text so far)
	if (stream === 'assistant' && typeof msg.payload.text === 'string') {
		run.text = msg.payload.text;
	}

	// Run completed
	if (stream === 'lifecycle' && msg.payload.phase === 'end') {
		clearTimeout(run.timer);
		pendingRuns.delete(runId);
		run.resolve(run.text || '(no response)');
	}

	// Run errored
	if (stream === 'lifecycle' && msg.payload.phase === 'error') {
		clearTimeout(run.timer);
		pendingRuns.delete(runId);
		run.reject(new Error(msg.payload.message as string ?? 'Agent run failed'));
	}
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

				// Handle event frames (agent streaming, ticks, etc.)
				if (msg.type === 'event') {
					handleEvent(msg);
				}
			} catch {
				// ignore malformed messages
			}
		});

		ws.on('close', () => {
			connected = false;
			agentWs = null;
			// Reject all pending runs
			for (const [id, run] of pendingRuns) {
				clearTimeout(run.timer);
				run.reject(new Error('Agent disconnected'));
			}
			pendingRuns.clear();
			console.log('[agent-proxy] disconnected from agent');
			scheduleReconnect();
		});

		ws.on('error', (err) => {
			console.error('[agent-proxy] ws error:', err.message);
			fail(err);
		});
	});
}

export function sendToAgent(message: string, sessionKey?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!agentWs || agentWs.readyState !== WebSocket.OPEN || !connected) {
			return reject(new Error('Agent not connected'));
		}

		const id = randomUUID();
		agentWs.send(JSON.stringify({
			type: 'req',
			id,
			method: 'chat.send',
			params: {
				sessionKey: sessionKey ?? 'agent:main:api:default',
				message,
				idempotencyKey: id
			}
		}));

		// chat.send returns {runId, status: "started"} immediately
		// We then wait for agent events to stream the actual response
		responseHandlers.set(id, (res) => {
			if (res.ok) {
				const runId = res.payload?.runId as string | undefined;
				if (!runId) {
					reject(new Error('No runId in chat.send response'));
					return;
				}
				const timer = setTimeout(() => {
					const run = pendingRuns.get(runId);
					if (run) {
						pendingRuns.delete(runId);
						run.reject(new Error('Agent response timeout'));
					}
				}, 120_000);
				pendingRuns.set(runId, { text: '', resolve, reject, timer });
			} else {
				reject(new Error(res.error?.message ?? 'Agent error'));
			}
		});

		// Timeout for the initial chat.send response
		setTimeout(() => {
			if (responseHandlers.has(id)) {
				responseHandlers.delete(id);
				reject(new Error('chat.send timeout'));
			}
		}, 30_000);
	});
}
