import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SiweMessage } from 'siwe';
import type { LoginRequest, LoginResponse, RefreshResponse } from '@quant-bot/shared-types';
import { createToken, authMiddleware } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';
import type { JwtPayload } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.post<{ Body: LoginRequest }>('/api/auth/login', async (request, reply) => {
		const { signature, message, address } = request.body;

		if (!signature || !message || !address) {
			return reply.status(400).send({ error: 'signature, message, and address are required' });
		}

		try {
			const siweMessage = new SiweMessage(message);
			const result = await siweMessage.verify({ signature });

			if (!result.success) {
				return reply.status(401).send({ error: 'Invalid signature' });
			}

			if (result.data.address.toLowerCase() !== address.toLowerCase()) {
				return reply.status(401).send({ error: 'Address mismatch' });
			}

			const userId = randomUUID();
			const token = await createToken(address, userId, config);

			const response: LoginResponse = {
				token,
				user: {
					id: userId,
					address: result.data.address,
					createdAt: Date.now()
				}
			};

			return response;
		} catch {
			return reply.status(401).send({ error: 'Signature verification failed' });
		}
	});

	app.post('/api/auth/refresh', {
		preHandler: authMiddleware(config),
		handler: async (request) => {
			const user = (request as FastifyRequest & { user: JwtPayload }).user;
			const token = await createToken(user.address, user.sub, config);
			const response: RefreshResponse = { token };
			return response;
		}
	});

	app.post<{ Body: { publicKey: string } }>('/api/auth/session-key', {
		preHandler: authMiddleware(config),
		handler: async (request) => {
			const user = (request as FastifyRequest & { user: JwtPayload }).user;
			const { publicKey } = request.body;

			// In production, this would register with Dynamic's session key system
			const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

			return { userId: user.sub, publicKey, expiresAt };
		}
	});
}

type FastifyRequest = import('fastify').FastifyRequest;
