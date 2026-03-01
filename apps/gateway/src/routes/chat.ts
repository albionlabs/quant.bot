import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { verifyToken } from '../middleware/auth.js';
import { createSession, getSession, touchSession } from '../services/session.js';
import { sendToAgent, isAgentConnected } from '../services/agent-proxy.js';
import type { GatewayConfig } from '../config.js';
import type { ClientMessage, ServerMessage } from '@quant-bot/shared-types';

export async function chatRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.get('/api/chat', { websocket: true }, async (socket: WebSocket, request) => {
		const url = new URL(request.url, `http://${request.headers.host}`);
		const token = url.searchParams.get('token');

		if (!token) {
			socket.send(JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED', message: 'Token required' }));
			socket.close();
			return;
		}

		let user;
		try {
			user = await verifyToken(token, config);
		} catch {
			socket.send(JSON.stringify({ type: 'error', code: 'AUTH_INVALID', message: 'Invalid token' }));
			socket.close();
			return;
		}

		if (!isAgentConnected()) {
			socket.send(
				JSON.stringify({ type: 'error', code: 'AGENT_UNAVAILABLE', message: 'Agent not available' })
			);
			socket.close();
			return;
		}

		socket.on('message', async (raw: Buffer) => {
			try {
				const msg = JSON.parse(raw.toString()) as ClientMessage;

				if (msg.type !== 'message' || !msg.content) return;

				let sessionId = msg.sessionId;
				if (!sessionId || !getSession(sessionId)) {
					const session = createSession(user!.sub);
					sessionId = session.id;
				}

				touchSession(sessionId);

				try {
					const result = await sendToAgent({
						message: msg.content,
						userId: user!.sub,
						onDelta: (delta) => {
							const streamMsg: ServerMessage = {
								type: 'stream',
								sessionId,
								delta
							};
							socket.send(JSON.stringify(streamMsg));
						}
					});
					const response: ServerMessage = {
						type: 'message',
						role: 'assistant',
						sessionId,
						content: result
					};
					socket.send(JSON.stringify(response));
				} catch (err) {
					const error: ServerMessage = {
						type: 'error',
						sessionId,
						code: 'AGENT_ERROR',
						message: err instanceof Error ? err.message : 'Agent error'
					};
					socket.send(JSON.stringify(error));
				}
			} catch {
				socket.send(JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: 'Invalid message' }));
			}
		});
	});
}
