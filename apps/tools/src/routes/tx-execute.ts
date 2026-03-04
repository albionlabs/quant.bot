import type { FastifyInstance } from 'fastify';
import type { TxExecuteRequest } from '@quant-bot/shared-types';
import { executeTransaction } from '../services/tx-executor.js';
import type { ToolsConfig } from '../config.js';

export async function txExecuteRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: TxExecuteRequest }>('/api/evm/execute', async (request, reply) => {
		const { to, data, userId } = request.body;

		if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
			return reply.status(400).send({ error: 'Invalid "to" address' });
		}
		if (!data || !data.startsWith('0x')) {
			return reply.status(400).send({ error: 'Invalid "data" field' });
		}
		if (!userId) {
			return reply.status(400).send({ error: 'userId is required' });
		}

		try {
			return await executeTransaction(request.body, config);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Execution failed';
			return reply.status(500).send({ error: message });
		}
	});
}
