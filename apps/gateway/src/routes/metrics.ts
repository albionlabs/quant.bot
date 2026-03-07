import type { FastifyInstance } from 'fastify';
import { getTokenMetricsSnapshot } from '../services/token-metrics.js';
import type { GatewayConfig } from '../config.js';

export async function metricsRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.get<{ Querystring: { limit?: string } }>(
		'/api/internal/metrics/tokens',
		async (request, reply) => {
			const internalSecret = request.headers['x-internal-secret'] as string | undefined;
			if (!internalSecret || internalSecret !== config.internalSecret) {
				return reply.status(401).send({ error: 'Invalid internal secret' });
			}

			const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
			return getTokenMetricsSnapshot(limit);
		}
	);
}
