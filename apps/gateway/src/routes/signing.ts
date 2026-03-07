import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SigningBundle, SigningCompleteResponse } from '@quant-bot/shared-types';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';

async function forwardErrorOrJson<T>(upstream: Response, reply: FastifyReply): Promise<T | void> {
	if (!upstream.ok) {
		const body = await upstream.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
		return reply.status(upstream.status).send(body);
	}
	return await upstream.json() as T;
}

export async function signingProxyRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.get<{ Params: { id: string } }>('/api/signing/:id', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;
			const { id } = request.params;

			const response = await fetch(`${config.toolsBaseUrl}/api/evm/signing/${id}`, {
				headers: { 'x-internal-secret': config.internalSecret }
			});

			const bundle = await forwardErrorOrJson<SigningBundle>(response, reply);
			if (!bundle) return;

			if (bundle.from !== user.sub) {
				return reply.status(403).send({ error: 'Bundle does not belong to this user' });
			}

			return bundle;
		}
	});

	app.post<{ Params: { id: string }; Body: { txHashes: string[] } }>('/api/signing/:id/complete', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;
			const { id } = request.params;
			const { txHashes } = request.body;

			if (!Array.isArray(txHashes) || txHashes.length === 0) {
				return reply.status(400).send({ error: 'txHashes array is required' });
			}

			const response = await fetch(`${config.toolsBaseUrl}/api/evm/signing/${id}/complete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-internal-secret': config.internalSecret
				},
				body: JSON.stringify({ userId: user.sub, txHashes })
			});

			return forwardErrorOrJson<SigningCompleteResponse>(response, reply);
		}
	});
}
