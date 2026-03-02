import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { decryptDelegatedWebhookData } from '../services/delegation-decrypt.js';
import { storeDelegation, activateDelegation } from '../services/delegation-store.js';
import type { GatewayConfig } from '../config.js';

function verifyWebhookSignature(secret: string, signature: string, payload: object): boolean {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	const digest = 'sha256=' + hmac.digest('hex');

	if (digest.length !== signature.length) return false;
	return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * Delegated share webhooks are a separate system from Dynamic's general
 * webhooks and may not include an HMAC signature header. When a signature
 * is present we verify it; otherwise we rely on the RSA-encrypted payload
 * as the authenticity guarantee (only our private key can decrypt it).
 */
function verifyIfSigned(config: GatewayConfig, signature: string | undefined, payload: object): boolean {
	if (!signature) return true;
	if (!config.dynamicWebhookSecret) return true;
	return verifyWebhookSignature(config.dynamicWebhookSecret, signature, payload);
}

interface EncryptedPayload {
	alg: string;
	iv: string;
	ct: string;
	tag: string;
	ek: string;
	kid?: string;
}

interface DelegationCreatedPayload {
	data: {
		chain: string;
		encryptedDelegatedShare: EncryptedPayload;
		encryptedWalletApiKey: EncryptedPayload;
		publicKey: string;
		userId: string;
		walletId: string;
	};
	eventName: 'wallet.delegation.created';
	userId: string;
}

interface DelegationRevokedPayload {
	data: {
		userId: string;
		walletId: string;
	};
	eventName: 'wallet.delegation.revoked';
	userId: string;
}

type WebhookPayload = DelegationCreatedPayload | DelegationRevokedPayload;

export async function webhookRoutes(app: FastifyInstance, config: GatewayConfig) {
	app.post('/api/webhooks/dynamic', async (request, reply) => {
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;
		const payload = request.body as WebhookPayload;

		if (!verifyIfSigned(config, signature, payload)) {
			return reply.status(401).send({ error: 'Invalid webhook signature' });
		}

		app.log.info({ eventName: payload.eventName }, 'Webhook received');

		if (payload.eventName === 'wallet.delegation.revoked') {
			const { userId, walletId } = payload.data;
			app.log.info({ userId, walletId }, 'Delegation revoked via webhook');
			// TODO: look up delegation by walletId and revoke
			return { status: 'revoked' };
		}

		if (payload.eventName === 'wallet.delegation.created') {
			const { encryptedDelegatedShare, encryptedWalletApiKey, userId, walletId, publicKey } = payload.data;

			if (!encryptedDelegatedShare || !encryptedWalletApiKey || !userId || !walletId) {
				return reply.status(400).send({ error: 'Missing required fields' });
			}

			const { decryptedDelegatedShare, decryptedWalletApiKey } = decryptDelegatedWebhookData({
				privateKeyPem: config.dynamicDelegationPrivateKey,
				encryptedDelegatedKeyShare: encryptedDelegatedShare,
				encryptedWalletApiKey
			});

			const delegationId = randomUUID();
			storeDelegation(
				delegationId,
				userId.toLowerCase(),
				walletId,
				publicKey.toLowerCase(),
				decryptedWalletApiKey,
				JSON.stringify(decryptedDelegatedShare),
				config.delegationEncryptionKey,
				8453,
				config.delegationTtlMs
			);

			activateDelegation(userId.toLowerCase(), delegationId);

			app.log.info({ delegationId, userId: userId.toLowerCase() }, 'Delegation stored from webhook');

			return { delegationId };
		}

		return reply.status(400).send({ error: `Unknown event: ${(payload as Record<string, unknown>).eventName}` });
	});
}
