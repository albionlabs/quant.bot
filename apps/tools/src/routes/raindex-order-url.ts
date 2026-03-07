import type { FastifyInstance } from 'fastify';

const RAINDEX_BASE_URL = 'https://v6.raindex.finance';
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_ORDERBOOK_ADDRESS = '0x52ceb8ebef648744ffdde89f7bc9c3ac35944775';

export async function raindexOrderUrlRoutes(app: FastifyInstance) {
	app.get<{
		Params: { orderHash: string };
		Querystring: { chainId?: string; orderbook?: string };
	}>('/api/raindex/order-url/:orderHash', async (request, reply) => {
		const { orderHash } = request.params;

		if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
			return reply.status(400).send({ error: 'orderHash must be a 0x-prefixed 32-byte hex string' });
		}

		const chainId = request.query.chainId ? parseInt(request.query.chainId, 10) : DEFAULT_CHAIN_ID;
		if (!Number.isFinite(chainId) || chainId <= 0) {
			return reply.status(400).send({ error: 'chainId must be a positive integer' });
		}

		const orderbook = request.query.orderbook || DEFAULT_ORDERBOOK_ADDRESS;
		const url = `${RAINDEX_BASE_URL}/orders/${chainId}-${orderbook}-${orderHash}`;

		return { url, orderHash, chainId, orderbook };
	});
}
