import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
	DelegationActivateRequest,
	DelegationActivateResponse
} from '@quant-bot/shared-types';
import { authMiddleware, type JwtPayload } from '../middleware/auth.js';
import {
	getDelegationStatus,
	getDelegationById,
	activateDelegation,
	revokeDelegation,
	getCredentials,
	DelegationServiceError
} from '../services/delegation-client.js';
import type { GatewayConfig } from '../config.js';

type AuthenticatedRequest = FastifyRequest & { user: JwtPayload };

export async function delegationRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.post<{ Body: DelegationActivateRequest }>('/api/auth/delegation/activate', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;
			const { delegationId, walletAddress } = request.body;

			if (!delegationId || !walletAddress) {
				return reply.status(400).send({ error: 'delegationId and walletAddress are required' });
			}

			try {
				const delegation = await getDelegationById(config, delegationId);
				if (delegation.userId !== user.sub) {
					return reply.status(403).send({ error: 'Delegation does not belong to this user' });
				}
			} catch {
				return reply.status(404).send({ error: 'Delegation not found' });
			}

			try {
				const result = await activateDelegation(config, user.sub, delegationId);
				const response: DelegationActivateResponse = { activeDelegationId: result.activeDelegationId };
				return response;
			} catch {
				return reply.status(400).send({ error: 'Delegation is expired or revoked' });
			}
		}
	});

	app.get('/api/auth/delegation/status', {
		preHandler: authMiddleware(config),
		handler: async (request) => {
			const user = (request as AuthenticatedRequest).user;
			return getDelegationStatus(config, user.sub);
		}
	});

	app.post('/api/auth/delegation/revoke', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;

			try {
				return await revokeDelegation(config, user.sub);
			} catch (err) {
				if (err instanceof DelegationServiceError) {
					return reply.status(err.status).send({ error: err.message });
				}
				return reply.status(502).send({ error: 'Delegation service unavailable' });
			}
		}
	});

	app.post<{ Body: { userId: string } }>('/api/internal/delegation/credentials', async (request, reply) => {
		const internalSecret = request.headers['x-internal-secret'] as string | undefined;
		if (!internalSecret || internalSecret !== config.internalSecret) {
			return reply.status(401).send({ error: 'Invalid internal secret' });
		}

		const { userId } = request.body;
		if (!userId) {
			return reply.status(400).send({ error: 'userId is required' });
		}

		try {
			return await getCredentials(config, userId);
		} catch {
			return reply.status(404).send({ error: 'No active delegation found for user' });
		}
	});
}
