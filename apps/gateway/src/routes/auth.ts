import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAddress, verifyMessage } from 'ethers';
import type { LoginRequest, LoginResponse, RefreshResponse } from '@quant-bot/shared-types';
import { createToken, authMiddleware, type JwtPayload } from '../middleware/auth.js';
import { apiKeyMiddleware } from '../middleware/api-key.js';
import type { GatewayConfig } from '../config.js';

export async function authRoutes(app: FastifyInstance, config: GatewayConfig) {
	const preHandler = config.apiKeys.length > 0 ? [apiKeyMiddleware(config)] : [];

	app.post<{ Body: LoginRequest }>('/api/auth/login', { preHandler }, async (request, reply) => {
		const { signature, message, address } = request.body;

		if (!signature || !message || !address) {
			return reply.status(400).send({ error: 'signature, message, and address are required' });
		}

		try {
			// Recover the signer from the original message + signature.
			// We skip SiweMessage parsing because siwe-parser@3 rejects
			// lowercase (non-EIP-55) addresses and Dynamic embedded wallets
			// produce lowercase addresses in the SIWE message text.
			const recoveredAddress = verifyMessage(message, signature);

			// Compare using checksummed addresses
			if (getAddress(recoveredAddress) !== getAddress(address)) {
				return reply.status(401).send({ error: 'Invalid signature' });
			}

			const checkedAddress = getAddress(address);
			const userId = checkedAddress.toLowerCase();
			const token = await createToken(checkedAddress, userId, config);

			const response: LoginResponse = {
				token,
				user: {
					id: userId,
					address: checkedAddress,
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
