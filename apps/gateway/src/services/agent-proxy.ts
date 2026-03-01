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

/**
 * Send a message to the agent via the OpenAI-compatible HTTP API.
 * This avoids the complexity of the WebSocket event streaming protocol.
 */
export async function sendToAgent(message: string, userId?: string): Promise<string> {
	if (!connected || !savedConfig) {
		throw new Error('Agent not connected');
	}

	// Derive HTTP URL from WebSocket URL
	const httpUrl = savedConfig.agentWsUrl
		.replace(/^ws:/, 'http:')
		.replace(/^wss:/, 'https:');

	const res = await fetch(`${httpUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${savedConfig.openclawGatewayToken}`
		},
		body: JSON.stringify({
			model: 'openclaw:main',
			messages: [{ role: 'user', content: message }],
			user: userId ?? 'default'
		}),
		signal: AbortSignal.timeout(120_000)
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Agent HTTP error ${res.status}: ${text}`);
	}

	const json = await res.json() as {
		choices?: Array<{ message?: { content?: string } }>;
	};

	const reply = json.choices?.[0]?.message?.content;
	if (!reply) {
		throw new Error('No response content from agent');
	}

	return reply;
}
