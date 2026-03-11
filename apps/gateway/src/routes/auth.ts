import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SiweMessage } from 'siwe';
import { getAddress } from 'ethers';
import type { LoginRequest, LoginResponse, RefreshResponse } from '@quant-bot/shared-types';
import { createToken, authMiddleware, type JwtPayload } from '../middleware/auth.js';
import { apiKeyMiddleware } from '../middleware/api-key.js';
import type { GatewayConfig } from '../config.js';

function checksumAddressInMessage(message: string): string {
	return message.replace(
		/(0x[0-9a-fA-F]{40})/g,
		(match) => {
			try {
				return getAddress(match);
			} catch {
				return match;
			}
		}
	);
}

export async function authRoutes(app: FastifyInstance, config: GatewayConfig) {
	const preHandler = config.apiKeys.length > 0 ? [apiKeyMiddleware(config)] : [];

	app.post<{ Body: LoginRequest }>('/api/auth/login', { preHandler }, async (request, reply) => {
		const { signature, message, address } = request.body;

		if (!signature || !message || !address) {
			return reply.status(400).send({ error: 'signature, message, and address are required' });
		}

		try {
			const siweMessage = new SiweMessage(checksumAddressInMessage(message));
			const result = await siweMessage.verify({ signature });

			if (!result.success) {
				return reply.status(401).send({ error: 'Invalid signature' });
			}

			if (result.data.address.toLowerCase() !== address.toLowerCase()) {
				return reply.status(401).send({ error: 'Address mismatch' });
			}

			const userId = result.data.address.toLowerCase();
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
		} catch (err) {
			request.log.error({ err }, 'SIWE verification failed');
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

}
