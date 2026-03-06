import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TxExecuteRequest } from '@quant-bot/shared-types';
import { executeTransaction, testSignMessage } from '../services/tx-executor.js';
import { resolveUserIdFromExecutionToken } from '../services/execution-token.js';
import type { ToolsConfig } from '../config.js';

function requireInternalSecret(config: ToolsConfig) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const secret = request.headers['x-internal-secret'] as string | undefined;
		if (!secret || secret !== config.internalSecret) {
			return reply.status(401).send({ error: 'Invalid internal secret' });
		}
	};
}

export async function txExecuteRoutes(app: FastifyInstance, config: ToolsConfig) {
	const checkSecret = requireInternalSecret(config);

	app.post<{ Body: { userId: string } }>('/api/evm/test-sign', { preHandler: checkSecret }, async (request, reply) => {
		const { userId } = request.body;
		if (!userId) {
			return reply.status(400).send({ error: 'userId is required' });
		}

		try {
			return await testSignMessage(userId, config);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Sign failed';
			return reply.status(500).send({ error: message });
		}
	});

	app.post<{ Body: TxExecuteRequest }>('/api/evm/execute', async (request, reply) => {
		const requestStarted = Date.now();
		const reqId = String(request.id);
		let clientAborted = false;
		request.raw.once('aborted', () => {
			clientAborted = true;
			app.log.warn(
				{ reqId, elapsedMs: Date.now() - requestStarted },
				'Client aborted /api/evm/execute before completion'
			);
		});

		const { to, data, executionToken } = request.body;
		app.log.info({ reqId }, 'Received /api/evm/execute request');

		if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
			app.log.warn({ reqId, reason: 'invalid_to' }, '/api/evm/execute rejected');
			return reply.status(400).send({ error: 'Invalid "to" address' });
		}
		if (!data || !data.startsWith('0x')) {
			app.log.warn({ reqId, reason: 'invalid_data' }, '/api/evm/execute rejected');
			return reply.status(400).send({ error: 'Invalid "data" field' });
		}
		if (!executionToken || typeof executionToken !== 'string') {
			app.log.warn({ reqId, reason: 'missing_execution_token' }, '/api/evm/execute rejected');
			return reply.status(400).send({ error: 'executionToken is required' });
		}

		let userId: string;
		try {
			userId = await resolveUserIdFromExecutionToken(executionToken, config.internalSecret);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid execution token';
			app.log.warn({ reqId, reason: 'invalid_execution_token', message }, '/api/evm/execute rejected');
			return reply.status(401).send({ error: message });
		}

		try {
			const result = await executeTransaction(
				{
					to,
					data,
					value: request.body.value
				},
				userId,
				config
			);
			app.log.info(
				{ reqId, elapsedMs: Date.now() - requestStarted, clientAborted },
				'/api/evm/execute completed successfully'
			);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Execution failed';
			app.log.error(
				{ reqId, elapsedMs: Date.now() - requestStarted, clientAborted, error: message },
				'/api/evm/execute failed'
			);
			return reply.status(500).send({ error: message });
		}
	});
}
