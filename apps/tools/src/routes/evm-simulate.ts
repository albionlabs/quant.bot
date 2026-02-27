import type { FastifyInstance } from 'fastify';
import type { EvmSimulateRequest } from '@quant-bot/shared-types';
import { simulateTransaction } from '../services/evm-simulator.js';
import type { ToolsConfig } from '../config.js';

export async function evmSimulateRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: EvmSimulateRequest }>('/api/evm/simulate', async (request, reply) => {
		const { to } = request.body;

		if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
			return reply.status(400).send({ error: 'Invalid "to" address' });
		}

		try {
			return await simulateTransaction(request.body, config.rpcUrl, config.chainName);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Simulation failed';
			return reply.status(500).send({ error: message });
		}
	});
}
