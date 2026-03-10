import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayConfig } from '../config.js';

export function apiKeyMiddleware(config: GatewayConfig) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const apiKey = request.headers['x-api-key'] as string | undefined;
		if (!apiKey || !config.apiKeys.includes(apiKey)) {
			return reply.status(403).send({ error: 'Invalid or missing API key' });
		}
	};
}
