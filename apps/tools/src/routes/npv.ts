import type { FastifyInstance } from 'fastify';
import type { NpvRequest } from '@quant-bot/shared-types';
import { handleNpv } from '../services/npv-calculator.js';

export async function npvRoutes(app: FastifyInstance) {
	app.post<{ Body: NpvRequest }>('/api/npv', async (request, reply) => {
		const { cashFlows, discountRate } = request.body;

		if (!Array.isArray(cashFlows) || cashFlows.length === 0) {
			return reply.status(400).send({ error: 'cashFlows must be a non-empty array of numbers' });
		}

		if (typeof discountRate !== 'number' || discountRate < -1) {
			return reply.status(400).send({ error: 'discountRate must be a number >= -1' });
		}

		return handleNpv({ cashFlows, discountRate });
	});
}
