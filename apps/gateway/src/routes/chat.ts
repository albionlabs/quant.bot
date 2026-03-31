import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { verifyToken } from '../middleware/auth.js';
import { createSession, restoreSession, getSession, touchSession } from '../services/session.js';
import { sendToAgent, isAgentConnected } from '../services/agent-proxy.js';
import { createExecutionToken } from '../services/execution-token.js';
import { recordTokenRun } from '../services/token-metrics.js';
import type { GatewayConfig } from '../config.js';
import { UI_VERSION, MIN_WIDGET_VERSION, semverLt } from '../version.js';
import type { ClientMessage, ServerMessage } from '@quant-bot/shared-types';

export async function chatRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.get('/api/chat', { websocket: true }, async (socket: WebSocket, request) => {
		const url = new URL(request.url, `http://${request.headers.host}`);
		const token = url.searchParams.get('token');

		const apiKey = url.searchParams.get('apiKey');
		if (config.apiKeys.length > 0 && (!apiKey || !config.apiKeys.includes(apiKey))) {
			socket.send(
				JSON.stringify({ type: 'error', code: 'API_KEY_INVALID', message: 'Invalid API key' })
			);
			socket.close();
			return;
		}

		const widgetVersion = url.searchParams.get('widgetVersion');
		if (widgetVersion && semverLt(widgetVersion, MIN_WIDGET_VERSION)) {
			socket.send(
				JSON.stringify({
					type: 'error',
					code: 'WIDGET_OUTDATED',
					message: `Widget version ${widgetVersion} is outdated. Please upgrade to ${MIN_WIDGET_VERSION} or later.`,
					minVersion: MIN_WIDGET_VERSION
				})
			);
			socket.close();
			return;
		}

		if (!token) {
			socket.send(
				JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED', message: 'Token required' })
			);
			socket.close();
			return;
		}

		let user;
		try {
			user = await verifyToken(token, config);
		} catch {
			socket.send(
				JSON.stringify({ type: 'error', code: 'AUTH_INVALID', message: 'Invalid token' })
			);
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

		socket.send(
			JSON.stringify({
				type: 'connected',
				sessionId: '',
				version: UI_VERSION
			})
		);

		socket.on('message', async (raw: Buffer) => {
			try {
				const msg = JSON.parse(raw.toString()) as ClientMessage;

				if (msg.type !== 'message' || !msg.content) return;

				let sessionId = msg.sessionId;
				if (!sessionId) {
					const session = createSession(user!.sub);
					sessionId = session.id;
				} else if (!getSession(sessionId)) {
					restoreSession(sessionId, user!.sub);
				}

				touchSession(sessionId);

				try {
					const executionToken = await createExecutionToken(
						user!.sub,
						config.internalSecret,
						config.executionTokenTtlSeconds
					);

					const messageWithContext = [
						`[trusted-context userId=${user!.sub} executionToken=${executionToken}]`,
						'Use this executionToken for signing/staging APIs. Never ask the user for userId, wallet address, or execution token.',
						'[/trusted-context]',
						msg.content
					].join('\n');

					let lastToolCallId: string | undefined;

					const result = await sendToAgent({
						message: messageWithContext,
						userId: user!.sub,
						sessionId,
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
							const progressMsg: ServerMessage = {
								type: 'progress',
								sessionId,
								status: progress
							};
							socket.send(JSON.stringify(progressMsg));
						},
						onToolCall: (name, args) => {
							lastToolCallId = crypto.randomUUID();
							const toolCallMsg: ServerMessage = {
								type: 'tool_call',
								sessionId,
								name,
								args,
								toolCallId: lastToolCallId
							};
							socket.send(JSON.stringify(toolCallMsg));
						},
						onToolResult: (name, result) => {
							const toolResultMsg: ServerMessage = {
								type: 'tool_result',
								sessionId,
								name,
								result,
								toolCallId: lastToolCallId
							};
							socket.send(JSON.stringify(toolResultMsg));
							lastToolCallId = undefined;
						},
						onError: (error) => {
							const errorMsg: ServerMessage = {
								type: 'error',
								sessionId,
								code: 'AGENT_ERROR',
								message: error
							};
							socket.send(JSON.stringify(errorMsg));
						},
						onUsage: (usage) => {
							if (config.tokenMetricsEnabled) {
								recordTokenRun({
									ts: Date.now(),
									userId: user!.sub,
									sessionId,
									status: usage.status,
									promptChars: usage.promptChars,
									completionChars: usage.completionChars,
									inputTokens: usage.inputTokens,
									outputTokens: usage.outputTokens,
									totalTokens: usage.totalTokens,
									providerInputTokens: usage.providerInputTokens,
									providerOutputTokens: usage.providerOutputTokens,
									providerTotalTokens: usage.providerTotalTokens,
									estimatedInputTokens: usage.estimatedInputTokens,
									estimatedOutputTokens: usage.estimatedOutputTokens,
									modelCalls: usage.modelCalls,
									usageEvents: usage.usageEvents,
									toolCalls: usage.toolCalls,
									streamCounts: usage.streamCounts
								});
							}

							app.log.info(
								{
									userId: user!.sub,
									sessionId,
									status: usage.status,
									inputTokens: usage.inputTokens,
									outputTokens: usage.outputTokens,
									totalTokens: usage.totalTokens,
									providerInputTokens: usage.providerInputTokens,
									providerOutputTokens: usage.providerOutputTokens,
									providerTotalTokens: usage.providerTotalTokens,
									estimatedInputTokens: usage.estimatedInputTokens,
									estimatedOutputTokens: usage.estimatedOutputTokens,
									modelCalls: usage.modelCalls,
									usageEvents: usage.usageEvents,
									toolCalls: usage.toolCalls
								},
								'chat.run.usage'
							);
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
				socket.send(
					JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: 'Invalid message' })
				);
			}
		});
	});
}
