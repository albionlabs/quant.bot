import type { FastifyInstance } from 'fastify';
import type { ToolsConfig } from '../config.js';
import { fetchOrderbookDepth } from '../services/orderbook.js';

export async function orderbookRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.get<{
		Params: { tokenAddress: string };
		Querystring: { side?: string; detail?: string };
	}>(
		'/api/exchange/orderbook/:tokenAddress',
		async (request, reply) => {
			const { tokenAddress } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			const sideParam = request.query.side ?? 'both';
			if (sideParam !== 'buy' && sideParam !== 'sell' && sideParam !== 'both') {
				return reply.status(400).send({ error: 'side must be "buy", "sell", or "both"' });
			}

			const detail = request.query.detail === 'true';

			try {
				return await fetchOrderbookDepth(tokenAddress, sideParam, config, detail);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to fetch orderbook';
				return reply.status(500).send({ error: message });
			}
		}
	);
}
