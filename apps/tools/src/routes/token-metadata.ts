import type { FastifyInstance } from 'fastify';
import { fetchTokenMetadata } from '../services/token-metadata.js';

export async function tokenMetadataRoutes(app: FastifyInstance) {
	app.get<{ Params: { address: string } }>(
		'/api/tokens/:address/metadata',
		async (request, reply) => {
			const { address } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			try {
				const { latest, history } = await fetchTokenMetadata(address);
				return { address, latest, history };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to fetch metadata';
				return reply.status(500).send({ error: message });
			}
		}
	);
}
