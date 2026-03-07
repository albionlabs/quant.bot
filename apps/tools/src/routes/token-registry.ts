import type { FastifyInstance } from 'fastify';
import { getAllTokens, lookupToken } from '../services/token-registry.js';

export async function tokenRegistryRoutes(app: FastifyInstance) {
	app.get('/api/tokens', async () => {
		const { name, tokens } = await getAllTokens();
		return { name, tokens, updatedAt: new Date().toISOString() };
	});

	app.get<{ Params: { symbolOrAddress: string } }>(
		'/api/tokens/:symbolOrAddress',
		async (request, reply) => {
			const { symbolOrAddress } = request.params;

			const token = await lookupToken(symbolOrAddress);
			if (!token) {
				return reply.status(404).send({ error: `Token not found: ${symbolOrAddress}` });
			}

			return { token };
		}
	);
}
