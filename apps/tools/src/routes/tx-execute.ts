import type { FastifyInstance } from 'fastify';
import type { TxExecuteRequest } from '@quant-bot/shared-types';
import { executeTransaction, testSignMessage } from '../services/tx-executor.js';
import { resolveUserIdFromExecutionToken } from '../services/execution-token.js';
import type { ToolsConfig } from '../config.js';

export async function txExecuteRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: { userId: string } }>('/api/evm/test-sign', { preHandler: async (request, reply) => {
		const secret = request.headers['x-internal-secret'] as string | undefined;
		if (!secret || secret !== config.internalSecret) {
			return reply.status(401).send({ error: 'Invalid internal secret' });
		}
	} }, async (request, reply) => {
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
		const { to, data, executionToken } = request.body;

		if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
			return reply.status(400).send({ error: 'Invalid "to" address' });
		}
		if (!data || !data.startsWith('0x')) {
			return reply.status(400).send({ error: 'Invalid "data" field' });
		}
		if (!executionToken || typeof executionToken !== 'string') {
			return reply.status(400).send({ error: 'executionToken is required' });
		}

		let userId: string;
		try {
			userId = await resolveUserIdFromExecutionToken(executionToken, config.internalSecret);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid execution token';
			return reply.status(401).send({ error: message });
		}

		try {
			return await executeTransaction(
				{
					to,
					data,
					value: request.body.value
				},
				userId,
				config
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Execution failed';
			return reply.status(500).send({ error: message });
		}
	});
}
