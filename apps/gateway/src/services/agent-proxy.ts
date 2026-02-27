import WebSocket from 'ws';
import type { GatewayConfig } from '../config.js';

let agentWs: WebSocket | null = null;
let messageId = 0;
let connected = false;

type MessageHandler = (data: unknown) => void;
const responseHandlers = new Map<string, MessageHandler>();

export function isAgentConnected(): boolean {
	return connected;
}

export function connectToAgent(config: GatewayConfig): Promise<void> {
	return new Promise((resolve, reject) => {
		agentWs = new WebSocket(config.agentWsUrl);

		agentWs.on('open', () => {
			const id = String(++messageId);
			agentWs!.send(
				JSON.stringify({
					type: 'req',
					id,
					method: 'connect',
					params: {
						role: 'operator',
						auth: { token: config.openclawGatewayToken }
					}
				})
			);

			responseHandlers.set(id, () => {
				connected = true;
				resolve();
			});
		});

		agentWs.on('message', (raw) => {
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

		agentWs.on('close', () => {
			connected = false;
			agentWs = null;
		});

		agentWs.on('error', (err) => {
			connected = false;
			reject(err);
		});
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
