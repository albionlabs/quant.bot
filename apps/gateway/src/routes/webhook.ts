import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { storeDelegation, activateDelegation } from '../services/delegation-store.js';
import type { GatewayConfig } from '../config.js';

function verifyWebhookSignature(secret: string, signature: string, payload: object): boolean {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	const digest = 'sha256=' + hmac.digest('hex');

	if (digest.length !== signature.length) return false;
	return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function webhookRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.post('/api/webhooks/dynamic', async (request, reply) => {
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;
		if (!signature) {
			return reply.status(401).send({ error: 'Missing signature header' });
		}

		const payload = request.body as Record<string, unknown>;
		if (!verifyWebhookSignature(config.dynamicWebhookSecret, signature, payload)) {
			return reply.status(401).send({ error: 'Invalid webhook signature' });
		}

		const { walletId, walletApiKey, keyShare, userId, walletAddress, chainId } = payload as {
			walletId: string;
			walletApiKey: string;
			keyShare: string;
			userId: string;
			walletAddress: string;
			chainId?: number;
		};

		if (!walletId || !walletApiKey || !keyShare || !userId || !walletAddress) {
			return reply.status(400).send({ error: 'Missing required fields' });
		}

		const delegationId = randomUUID();
		storeDelegation(
			delegationId,
			userId.toLowerCase(),
			walletId,
			walletAddress.toLowerCase(),
			walletApiKey,
			keyShare,
			config.delegationEncryptionKey,
			chainId ?? 8453,
			config.delegationTtlMs
		);

		activateDelegation(userId.toLowerCase(), delegationId);

		app.log.info({ delegationId, userId: userId.toLowerCase() }, 'Delegation stored from webhook');

		return { delegationId };
	});
}
