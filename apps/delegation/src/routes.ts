import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { decryptDelegatedWebhookData, type EncryptedDelegatedPayload } from './services/delegation-decrypt.js';
import {
	storeDelegation,
	activateDelegation,
	getActiveDelegation,
	getDelegation,
	getDecryptedCredentials,
	revokeDelegation
} from './services/delegation-store.js';
import type { DelegationConfig } from './config.js';

function verifyWebhookSignature(secret: string, signature: string, payload: object): boolean {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	const digest = 'sha256=' + hmac.digest('hex');

	if (digest.length !== signature.length) return false;
	return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function verifyIfSigned(config: DelegationConfig, signature: string | undefined, payload: object): boolean {
	if (!signature) return true;
	if (!config.dynamicWebhookSecret) return true;
	return verifyWebhookSignature(config.dynamicWebhookSecret, signature, payload);
}

interface WebhookCreatedBody {
	data: {
		chain: string;
		encryptedDelegatedShare: EncryptedDelegatedPayload;
		encryptedWalletApiKey: EncryptedDelegatedPayload;
		publicKey: string;
		userId: string;
		walletId: string;
	};
	eventName: 'wallet.delegation.created';
	userId: string;
	signature?: string;
}

interface WebhookRevokedBody {
	data: {
		userId: string;
		walletId: string;
	};
	eventName: 'wallet.delegation.revoked';
	userId: string;
	signature?: string;
}

type WebhookPayload = WebhookCreatedBody | WebhookRevokedBody;

function requireInternalSecret(config: DelegationConfig) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const secret = request.headers['x-internal-secret'] as string | undefined;
		if (!secret || secret !== config.internalSecret) {
			return reply.status(401).send({ error: 'Invalid internal secret' });
		}
	};
}

export async function delegationRoutes(app: FastifyInstance, config: DelegationConfig): Promise<void> {
	const checkSecret = requireInternalSecret(config);

	app.post('/webhook/created', { preHandler: checkSecret }, async (request, reply) => {
		const payload = request.body as WebhookPayload;
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;

		if (!verifyIfSigned(config, signature, payload)) {
			return reply.status(401).send({ error: 'Invalid webhook signature' });
		}

		if (payload.eventName !== 'wallet.delegation.created') {
			return reply.status(400).send({ error: `Expected wallet.delegation.created, got ${payload.eventName}` });
		}

		const { encryptedDelegatedShare, encryptedWalletApiKey, userId, walletId, publicKey } = payload.data;

		if (!encryptedDelegatedShare || !encryptedWalletApiKey || !userId || !walletId || !publicKey) {
			return reply.status(400).send({ error: 'Missing required fields' });
		}

		const { decryptedDelegatedShare, decryptedWalletApiKey } = decryptDelegatedWebhookData({
			privateKeyPem: config.dynamicDelegationPrivateKey,
			encryptedDelegatedKeyShare: encryptedDelegatedShare,
			encryptedWalletApiKey
		});

		const walletAddress = publicKey.toLowerCase();
		const delegationId = randomUUID();
		storeDelegation(
			delegationId,
			walletAddress,
			walletId,
			walletAddress,
			decryptedWalletApiKey,
			JSON.stringify(decryptedDelegatedShare),
			config.delegationEncryptionKey,
			8453,
			config.delegationTtlMs
		);

		activateDelegation(walletAddress, delegationId);

		app.log.info({ delegationId, walletAddress, dynamicUserId: userId }, 'Delegation stored from webhook');

		return { delegationId };
	});

	app.post('/webhook/revoked', { preHandler: checkSecret }, async (request, reply) => {
		const payload = request.body as WebhookPayload;
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;

		if (!verifyIfSigned(config, signature, payload)) {
			return reply.status(401).send({ error: 'Invalid webhook signature' });
		}

		if (payload.eventName !== 'wallet.delegation.revoked') {
			return reply.status(400).send({ error: `Expected wallet.delegation.revoked, got ${payload.eventName}` });
		}

		const { userId, walletId } = payload.data;
		app.log.info({ userId, walletId }, 'Delegation revoked via webhook');
		// TODO: look up delegation by walletId and revoke
		return { status: 'revoked' };
	});

	app.get<{ Params: { userId: string } }>('/status/:userId', { preHandler: checkSecret }, async (request) => {
		const { userId } = request.params;
		const delegation = getActiveDelegation(userId);

		if (!delegation) {
			return { active: false };
		}

		return {
			active: true,
			delegationId: delegation.id,
			walletAddress: delegation.walletAddress,
			expiresAt: delegation.expiresAt
		};
	});

	app.get<{ Params: { delegationId: string } }>('/delegation/:delegationId', { preHandler: checkSecret }, async (request, reply) => {
		const { delegationId } = request.params;
		const delegation = getDelegation(delegationId);

		if (!delegation) {
			return reply.status(404).send({ error: 'Delegation not found' });
		}

		return {
			id: delegation.id,
			userId: delegation.userId,
			walletAddress: delegation.walletAddress,
			status: delegation.status,
			chainId: delegation.chainId,
			expiresAt: delegation.expiresAt
		};
	});

	app.post<{ Body: { userId: string; delegationId: string } }>('/activate', { preHandler: checkSecret }, async (request, reply) => {
		const { userId, delegationId } = request.body;

		if (!userId || !delegationId) {
			return reply.status(400).send({ error: 'userId and delegationId are required' });
		}

		if (!activateDelegation(userId, delegationId)) {
			return reply.status(400).send({ error: 'Delegation not found, expired, or does not belong to user' });
		}

		return { activeDelegationId: delegationId };
	});

	app.post<{ Body: { userId: string } }>('/revoke', { preHandler: checkSecret }, async (request, reply) => {
		const { userId } = request.body;

		if (!userId) {
			return reply.status(400).send({ error: 'userId is required' });
		}

		const delegation = getActiveDelegation(userId);
		if (!delegation) {
			return reply.status(404).send({ error: 'No active delegation found' });
		}

		// Revoke on Dynamic's side so re-delegation triggers a new webhook
		if (config.dynamicEnvironmentId && config.dynamicAdminKey) {
			try {
				const url = `https://app.dynamicauth.com/api/v0/sdk/${config.dynamicEnvironmentId}/waas/${delegation.walletId}/delegatedAccess/revoke`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${config.dynamicAdminKey}`,
						'Content-Type': 'application/json'
					}
				});
				if (!res.ok) {
					app.log.warn({ status: res.status, walletId: delegation.walletId }, 'Failed to revoke delegation on Dynamic');
				} else {
					app.log.info({ walletId: delegation.walletId }, 'Delegation revoked on Dynamic');
				}
			} catch (err) {
				app.log.warn({ err, walletId: delegation.walletId }, 'Error revoking delegation on Dynamic');
			}
		}

		revokeDelegation(delegation.id);
		return { status: 'revoked' };
	});

	app.get<{ Params: { userId: string } }>('/credentials/:userId', { preHandler: checkSecret }, async (request, reply) => {
		const { userId } = request.params;
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
