import WebSocket from 'ws';
import type { GatewayConfig } from '../config.js';

let agentWs: WebSocket | null = null;
let messageId = 0;
let connected = false;
let savedConfig: GatewayConfig | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

type MessageHandler = (data: unknown) => void;
const responseHandlers = new Map<string, MessageHandler>();

export function isAgentConnected(): boolean {
	return connected;
}

function scheduleReconnect(): void {
	if (reconnectTimer || !savedConfig) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectToAgent(savedConfig!).catch(() => {});
	}, reconnectDelay);
	reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function setupListeners(ws: WebSocket, resolve: () => void, reject: (err: Error) => void, isReconnect: boolean): void {
	ws.on('message', (raw) => {
		try {
			const msg = JSON.parse(raw.toString());
			const handler = responseHandlers.get(msg.id);
			if (handler) {
				handler(msg);
				responseHandlers.delete(msg.id);
			}
		} catch {
			// ignore malformed messages
		}
	});

	ws.on('close', () => {
		connected = false;
		agentWs = null;
		scheduleReconnect();
	});

	ws.on('error', (err) => {
		connected = false;
		agentWs = null;
		if (!isReconnect) reject(err);
		scheduleReconnect();
	});

	ws.on('open', () => {
		reconnectDelay = 1000;
		const id = String(++messageId);
		ws.send(
			JSON.stringify({
				type: 'req',
				id,
				method: 'connect',
				params: {
					role: 'operator',
					auth: { token: savedConfig!.openclawGatewayToken }
				}
			})
		);

		responseHandlers.set(id, () => {
			connected = true;
			resolve();
		});
	});
}

export function connectToAgent(config: GatewayConfig): Promise<void> {
	savedConfig = config;
	return new Promise((resolve, reject) => {
		const isReconnect = agentWs === null && savedConfig === config;
		agentWs = new WebSocket(config.agentWsUrl);
		setupListeners(agentWs, resolve, reject, isReconnect);
	});
}

export function sendToAgent(message: string): Promise<unknown> {
	return new Promise((resolve, reject) => {
		if (!agentWs || agentWs.readyState !== WebSocket.OPEN) {
			return reject(new Error('Agent not connected'));
		}

		const id = String(++messageId);
		agentWs.send(
			JSON.stringify({
				type: 'req',
				id,
				method: 'chat.send',
				params: { message }
			})
		);

		responseHandlers.set(id, resolve);

		setTimeout(() => {
			if (responseHandlers.has(id)) {
				responseHandlers.delete(id);
				reject(new Error('Agent response timeout'));
			}
		}, 120_000);
	});
}
