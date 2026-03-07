import type { FastifyInstance } from 'fastify';
import { fetchOwnerOrders } from '../services/owner-orders.js';

export async function ownerOrdersRoutes(app: FastifyInstance) {
	app.get<{
		Querystring: { owner: string; limit?: string };
	}>('/api/orders', async (request, reply) => {
		const { owner } = request.query;

		if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
			return reply.status(400).send({ error: 'owner must be a valid 0x address' });
		}

		const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
		if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
			return reply.status(400).send({ error: 'limit must be between 1 and 100' });
		}

		try {
			const orders = await fetchOwnerOrders(owner, limit);
			return { owner, orders, total: orders.length };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch orders';
			return reply.status(500).send({ error: message });
		}
	});
}
