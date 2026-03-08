import type { FastifyInstance } from 'fastify';
import { fetchTokenMetadata, fetchRawTokenMetadata } from '../services/token-metadata.js';
import { getCached, setCached, buildSchema, extractFields } from '../services/metadata-cache.js';

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

	app.get<{ Params: { address: string } }>(
		'/api/tokens/:address/metadata/load',
		async (request, reply) => {
			const { address } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			try {
				const existing = getCached(address);
				if (existing) {
					return {
						address,
						schema: buildSchema(existing),
						cachedUntil: Date.now() + 10 * 60 * 1000
					};
				}

				const raw = await fetchRawTokenMetadata(address);
				if (!raw) {
					return reply.status(404).send({ error: 'No metadata found for this token' });
				}

				const cachedUntil = setCached(address, raw);
				return { address, schema: buildSchema(raw), cachedUntil };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to load metadata';
				return reply.status(500).send({ error: message });
			}
		}
	);

	app.get<{ Params: { address: string }; Querystring: { paths?: string } }>(
		'/api/tokens/:address/metadata/fields',
		async (request, reply) => {
			const { address } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			const pathsParam = request.query.paths;
			if (!pathsParam) {
				return reply.status(400).send({ error: 'Missing required query parameter: paths' });
			}

			const paths = pathsParam.split(',').map((p) => p.trim()).filter(Boolean);
			if (paths.length === 0) {
				return reply.status(400).send({ error: 'paths parameter must contain at least one field path' });
			}

			const cached = getCached(address);
			if (!cached) {
				return reply.status(404).send({
					error: 'Metadata not loaded. Call /api/tokens/:address/metadata/load first.'
				});
			}

			return { address, fields: extractFields(cached, paths) };
		}
	);
}
