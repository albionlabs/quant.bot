import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
	DelegationActivateRequest,
	DelegationActivateResponse,
	DelegationStatusResponse
} from '@quant-bot/shared-types';
import { authMiddleware, type JwtPayload } from '../middleware/auth.js';
import {
	activateDelegation,
	getActiveDelegation,
	getDelegation,
	getDecryptedCredentials,
	revokeDelegation
} from '../services/delegation-store.js';
import type { GatewayConfig } from '../config.js';

type AuthenticatedRequest = FastifyRequest & { user: JwtPayload };

export async function delegationRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.post<{ Body: DelegationActivateRequest }>('/api/auth/delegation/activate', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;
			const { delegationId, walletAddress } = request.body;

			if (!delegationId || !walletAddress) {
				return reply.status(400).send({ error: 'delegationId and walletAddress are required' });
			}

			const delegation = getDelegation(delegationId);
			if (!delegation) {
				return reply.status(404).send({ error: 'Delegation not found' });
			}

			if (delegation.userId !== user.sub) {
				return reply.status(403).send({ error: 'Delegation does not belong to this user' });
			}

			if (!activateDelegation(user.sub, delegationId)) {
				return reply.status(400).send({ error: 'Delegation is expired or revoked' });
			}

			const response: DelegationActivateResponse = { activeDelegationId: delegationId };
			return response;
		}
	});

	app.get('/api/auth/delegation/status', {
		preHandler: authMiddleware(config),
		handler: async (request) => {
			const user = (request as AuthenticatedRequest).user;
			const delegation = getActiveDelegation(user.sub);

			const response: DelegationStatusResponse = delegation
				? {
						active: true,
						delegationId: delegation.id,
						walletAddress: delegation.walletAddress,
						expiresAt: delegation.expiresAt
					}
				: { active: false };

			return response;
		}
	});

	app.post('/api/auth/delegation/revoke', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const user = (request as AuthenticatedRequest).user;
			const delegation = getActiveDelegation(user.sub);

			if (!delegation) {
				return reply.status(404).send({ error: 'No active delegation found' });
			}

			revokeDelegation(delegation.id);
			return { status: 'revoked' };
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

		const delegation = getActiveDelegation(userId);
		if (!delegation) {
			return reply.status(404).send({ error: 'No active delegation found for user' });
		}

		const credentials = getDecryptedCredentials(delegation.id, config.delegationEncryptionKey);
		if (!credentials) {
			return reply.status(404).send({ error: 'Failed to decrypt delegation credentials' });
		}

		return credentials;
	});
}
