import type { FastifyInstance } from 'fastify';
import { CHAIN_ID, RAINDEX_BASE_URL, RAINDEX_ORDERBOOK_ADDRESS } from '../constants.js';

export async function raindexOrderUrlRoutes(app: FastifyInstance) {
	app.get<{
		Params: { orderHash: string };
		Querystring: { chainId?: string; orderbook?: string };
	}>('/api/raindex/order-url/:orderHash', async (request, reply) => {
		const { orderHash } = request.params;

		if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
			return reply.status(400).send({ error: 'orderHash must be a 0x-prefixed 32-byte hex string' });
		}

		const chainId = request.query.chainId ? parseInt(request.query.chainId, 10) : CHAIN_ID;
		if (!Number.isFinite(chainId) || chainId <= 0) {
			return reply.status(400).send({ error: 'chainId must be a positive integer' });
		}

		const orderbook = request.query.orderbook || RAINDEX_ORDERBOOK_ADDRESS;
		const url = `${RAINDEX_BASE_URL}/orders/${chainId}-${orderbook}-${orderHash}`;

		return { url, orderHash, chainId, orderbook };
	});
}
