import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config.js';

export async function registerRateLimit(app: FastifyInstance, config: GatewayConfig) {
	await app.register(rateLimit, {
		max: config.rateLimitMax,
		timeWindow: config.rateLimitWindow,
		keyGenerator: (request) => {
			const user = (request as unknown as Record<string, unknown>).user as
				| { sub: string }
				| undefined;
			return user?.sub ?? request.ip;
		}
	});
}
