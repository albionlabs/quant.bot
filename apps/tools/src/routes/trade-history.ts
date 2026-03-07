import type { FastifyInstance } from 'fastify';
import { fetchTradeHistory } from '../services/trade-history.js';

export async function tradeHistoryRoutes(app: FastifyInstance) {
	app.get<{
		Params: { tokenAddress: string };
		Querystring: { limit?: string; detail?: string };
	}>(
		'/api/exchange/trades/:tokenAddress',
		async (request, reply) => {
			const { tokenAddress } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
			if (isNaN(limit) || limit < 1 || limit > 100) {
				return reply.status(400).send({ error: 'limit must be between 1 and 100' });
			}

			const detail = request.query.detail === 'true';

			try {
				const result = await fetchTradeHistory(tokenAddress, limit, detail);
				return { tokenAddress, ...result };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to fetch trades';
				app.log.error(
					{ err: error, tokenAddress, limit, detail },
					'trade-history route failed'
				);
				return reply.status(500).send({ error: message });
			}
		}
	);
}
