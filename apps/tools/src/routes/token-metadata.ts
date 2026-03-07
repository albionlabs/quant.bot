import type { FastifyInstance } from 'fastify';
import { fetchTokenMetadata } from '../services/token-metadata.js';

export async function tokenMetadataRoutes(app: FastifyInstance) {
	app.get<{ Params: { address: string }; Querystring: { limit?: string } }>(
		'/api/tokens/:address/metadata',
		async (request, reply) => {
			const { address } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? '1', 10) || 1));

			try {
				const { display, latest, history } = await fetchTokenMetadata(address, limit);
				return { address, display, latest, history };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to fetch metadata';
				return reply.status(500).send({ error: message });
			}
		}
	);
}
