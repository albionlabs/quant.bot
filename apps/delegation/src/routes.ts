import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWebhookSignature } from '@quant-bot/shared-types';
import { decryptDelegatedWebhookData, type EncryptedDelegatedPayload } from './services/delegation-decrypt.js';
import {
	storeDelegation,
	activateDelegation,
	getActiveDelegation,
	getDelegation,
	getDecryptedCredentials,
	revokeByWalletId,
	revokeDelegation
} from './services/delegation-store.js';
import type { DelegationConfig } from './config.js';

interface SignatureVerificationResult {
	ok: boolean;
	status: number;
	error?: string;
}

function verifyIfSigned(
	config: DelegationConfig,
	signature: string | undefined,
	payload: object
): SignatureVerificationResult {
	if (!config.dynamicWebhookSecret) {
		return {
			ok: false,
			status: 503,
			error: 'DYNAMIC_WEBHOOK_SECRET is not configured'
		};
	}
	if (!signature) {
		return {
			ok: false,
			status: 401,
			error: 'Missing webhook signature'
		};
	}
	if (!verifyWebhookSignature(config.dynamicWebhookSecret, signature, payload)) {
		return {
			ok: false,
			status: 401,
			error: 'Invalid webhook signature'
		};
	}

	return { ok: true, status: 200 };
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

const CHAIN_ID_MAP: Record<string, number> = {
	EVM: 8453,
	'eip155:8453': 8453,
	'eip155:84532': 84532,
	base: 8453,
	'base-sepolia': 84532
};

function isEthereumAddress(value: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export async function delegationRoutes(app: FastifyInstance, config: DelegationConfig): Promise<void> {
	const checkSecret = requireInternalSecret(config);

	app.post('/webhook/created', { preHandler: checkSecret }, async (request, reply) => {
		const payload = request.body as WebhookPayload;
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;

		const signatureCheck = verifyIfSigned(config, signature, payload);
		if (!signatureCheck.ok) {
			return reply.status(signatureCheck.status).send({ error: signatureCheck.error });
		}

		if (payload.eventName !== 'wallet.delegation.created') {
			return reply.status(400).send({ error: `Expected wallet.delegation.created, got ${payload.eventName}` });
		}

		const { encryptedDelegatedShare, encryptedWalletApiKey, userId, walletId, publicKey, chain } = payload.data;

		if (!encryptedDelegatedShare || !encryptedWalletApiKey || !userId || !walletId || !publicKey) {
			return reply.status(400).send({ error: 'Missing required fields' });
		}

		if (!isEthereumAddress(publicKey)) {
			app.log.error({ publicKey, length: publicKey.length }, 'publicKey is not an Ethereum address — userId mismatch will occur');
			return reply.status(400).send({ error: 'publicKey is not a valid Ethereum address' });
		}

		const { decryptedDelegatedShare, decryptedWalletApiKey } = decryptDelegatedWebhookData({
			privateKeyPem: config.dynamicDelegationPrivateKey,
			encryptedDelegatedKeyShare: encryptedDelegatedShare,
			encryptedWalletApiKey
		});

		// === Phase 2: Share shape before storage ===
		const shareStringified = JSON.stringify(decryptedDelegatedShare);
		const shareReparsed = JSON.parse(shareStringified);
		console.log('[delegation-webhook] SHARE BEFORE STORAGE:', {
			stringifiedLength: shareStringified.length,
			pubkeyPubkeyConstructor: shareReparsed?.pubkey?.pubkey?.constructor?.name,
			pubkeyPubkeyIsUint8Array: shareReparsed?.pubkey?.pubkey instanceof Uint8Array,
			pubkeyPubkeyFirst3Keys: shareReparsed?.pubkey?.pubkey && typeof shareReparsed.pubkey.pubkey === 'object'
				? Object.keys(shareReparsed.pubkey.pubkey).slice(0, 3) : 'N/A',
		});

		const walletAddress = publicKey.toLowerCase();
		const chainId = CHAIN_ID_MAP[chain] ?? 8453;
		const delegationId = randomUUID();
		storeDelegation(
			delegationId,
			walletAddress,
			walletId,
			walletAddress,
			decryptedWalletApiKey,
			shareStringified,
			config.delegationEncryptionKey,
			chainId,
			config.delegationTtlMs
		);

		activateDelegation(walletAddress, delegationId);

		// === Phase 4: Delegation fingerprint ===
		const keyShareHash = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(shareStringified)
		).then(buf => Buffer.from(buf).toString('hex').substring(0, 16));

		console.log('[delegation-webhook] DELEGATION FINGERPRINT:', {
			delegationId,
			walletId,
			walletAddress,
			chainId,
			keyShareHash,
			walletApiKeyPrefix: decryptedWalletApiKey.substring(0, 8) + '...',
			storedAt: new Date().toISOString(),
		});

		app.log.info({ delegationId, walletAddress, chain, chainId, dynamicUserId: userId }, 'Delegation stored from webhook');

		return { delegationId };
	});

	app.post('/webhook/revoked', { preHandler: checkSecret }, async (request, reply) => {
		const payload = request.body as WebhookPayload;
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;

		const signatureCheck = verifyIfSigned(config, signature, payload);
		if (!signatureCheck.ok) {
			return reply.status(signatureCheck.status).send({ error: signatureCheck.error });
		}

		if (payload.eventName !== 'wallet.delegation.revoked') {
			return reply.status(400).send({ error: `Expected wallet.delegation.revoked, got ${payload.eventName}` });
		}

		const { userId, walletId } = payload.data;
		if (!walletId) {
			return reply.status(400).send({ error: 'walletId is required' });
		}

		const revoked = revokeByWalletId(walletId);
		if (!revoked) {
			// Idempotent case: delegation may already be locally reconciled (e.g. explicit /revoke call).
			app.log.info({ userId, walletId }, 'Delegation revocation webhook already reconciled');
			return { status: 'already_revoked' };
		}

		app.log.info({ userId, walletId }, 'Delegation revoked via webhook');
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
			return { status: 'already_revoked' };
		}

		// Dynamic v4.65+ performs delegation revoke through user-driven MPC reshare in the client SDK.
		// This endpoint only reconciles local delegation state after that flow (or webhook) completes.
		revokeDelegation(delegation.id);
		app.log.info({ userId, walletId: delegation.walletId }, 'Delegation revoked locally');
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
