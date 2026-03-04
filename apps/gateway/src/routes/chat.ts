import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { verifyToken } from '../middleware/auth.js';
import { createSession, getSession, touchSession } from '../services/session.js';
import { sendToAgent, isAgentConnected } from '../services/agent-proxy.js';
import { getDelegationStatus } from '../services/delegation-client.js';
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
					let delegationContext = `Authenticated userId: ${user!.sub}\n`;
					try {
						const status = await getDelegationStatus(config, user!.sub);
						if (status.active) {
							delegationContext += `Delegation active: true\n`;
							if (status.delegationId) {
								delegationContext += `Active delegationId: ${status.delegationId}\n`;
							}
						} else {
							delegationContext += `Delegation active: false\n`;
						}
					} catch {
						delegationContext += 'Delegation status unavailable\n';
					}

					const messageWithContext = [
						'[Trusted execution context from authenticated gateway session]',
						delegationContext.trim(),
						'Never ask the user for userId or delegationId. Use this context for execution.',
						'[/Trusted execution context]',
						'',
						msg.content
					].join('\n');

					const result = await sendToAgent({
						message: messageWithContext,
						userId: user!.sub,
						timeoutMs: config.agentResponseTimeoutMs,
						onDelta: (delta) => {
							const streamMsg: ServerMessage = {
								type: 'stream',
								sessionId,
								delta
							};
							socket.send(JSON.stringify(streamMsg));
						},
						onProgress: (progress) => {
							const streamMsg: ServerMessage = {
								type: 'stream',
								sessionId,
								delta: `\n${progress}\n`
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
