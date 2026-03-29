import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { delegationRoutes } from './routes.js';
import { clearAll } from './services/delegation-store.js';
import type { DelegationConfig } from './config.js';

vi.mock('./services/delegation-decrypt.js', () => ({
	decryptDelegatedWebhookData: vi.fn().mockReturnValue({
		decryptedDelegatedShare: {
			pubkey: { pubkey: { 0: 1, 1: 2 } },
			secretShare: 'mock-secret-share'
		},
		decryptedWalletApiKey: 'mock-api-key'
	})
}));

const config: DelegationConfig = {
	port: 5000,
	host: '0.0.0.0',
	delegationEncryptionKey: 'test-encryption-key-for-routes',
	dynamicDelegationPrivateKey: 'test-private-key',
	dynamicWebhookSecret: 'test-webhook-secret',
	dynamicEnvironmentId: 'test-env',
	dynamicAdminKey: '',
	internalSecret: 'test-internal-secret',
	delegationTtlMs: 86_400_000
};

function createSignature(secret: string, payload: object): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	return 'sha256=' + hmac.digest('hex');
}

function validCreatedPayload() {
	return {
		eventName: 'wallet.delegation.created' as const,
		userId: 'dynamic-user-1',
		data: {
			chain: 'EVM',
			encryptedDelegatedShare: { alg: 'RSA-OAEP-256', iv: 'a', ct: 'b', tag: 'c', ek: 'd' },
			encryptedWalletApiKey: { alg: 'RSA-OAEP-256', iv: 'e', ct: 'f', tag: 'g', ek: 'h' },
			publicKey: '0x1234567890abcdef1234567890abcdef12345678',
			userId: 'dynamic-user-1',
			walletId: 'wallet-1'
		}
	};
}

describe('delegation routes', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		clearAll();
		app = Fastify();
		await app.register((instance) => delegationRoutes(instance, config));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	describe('POST /webhook/created', () => {
		it('returns 401 without internal secret', async () => {
			const payload = validCreatedPayload();
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				payload
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Invalid internal secret');
		});

		it('returns 401 with wrong internal secret', async () => {
			const payload = validCreatedPayload();
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: { 'x-internal-secret': 'wrong' },
				payload
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns 401 without webhook signature', async () => {
			const payload = validCreatedPayload();
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: { 'x-internal-secret': config.internalSecret },
				payload
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Missing webhook signature');
		});

		it('returns 401 with invalid webhook signature', async () => {
			const payload = validCreatedPayload();
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
				},
				payload
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Invalid webhook signature');
		});

		it('returns 400 for wrong event name', async () => {
			const payload = { ...validCreatedPayload(), eventName: 'wallet.delegation.revoked' };
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toContain('Expected wallet.delegation.created');
		});

		it('returns 400 when required fields are missing', async () => {
			const payload = validCreatedPayload();
			payload.data.publicKey = '' as any;
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(400);
		});

		it('returns 400 when publicKey is not a valid Ethereum address', async () => {
			const payload = validCreatedPayload();
			payload.data.publicKey = 'not-an-address';
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('publicKey is not a valid Ethereum address');
		});

		it('stores delegation successfully with valid payload', async () => {
			const payload = validCreatedPayload();
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().delegationId).toBeDefined();
		});

		it('returns 400 when decryption fails', async () => {
			const { decryptDelegatedWebhookData } = await import('./services/delegation-decrypt.js');
			vi.mocked(decryptDelegatedWebhookData).mockImplementationOnce(() => {
				throw new Error('decryption failed');
			});

			const payload = validCreatedPayload();
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('Invalid delegation payload from Dynamic');
		});
	});

	describe('POST /webhook/revoked', () => {
		it('revokes an existing delegation', async () => {
			// First create a delegation
			const createPayload = validCreatedPayload();
			const createSig = createSignature(config.dynamicWebhookSecret, createPayload);
			const createRes = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': createSig
				},
				payload: createPayload
			});
			expect(createRes.statusCode).toBe(200);

			// Now revoke it — use 0ms grace period (default behavior for no graceMs argument)
			const revokePayload = {
				eventName: 'wallet.delegation.revoked',
				userId: 'dynamic-user-1',
				data: { userId: 'dynamic-user-1', walletId: 'wallet-1' }
			};
			const revokeSig = createSignature(config.dynamicWebhookSecret, revokePayload);
			const revokeRes = await app.inject({
				method: 'POST',
				url: '/webhook/revoked',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': revokeSig
				},
				payload: revokePayload
			});
			// Grace period of 60s means the just-created delegation won't be revoked
			expect(revokeRes.statusCode).toBe(200);
			expect(revokeRes.json().status).toMatch(/revoked|already_revoked/);
		});

		it('returns 400 when walletId is missing', async () => {
			const payload = {
				eventName: 'wallet.delegation.revoked',
				userId: 'u1',
				data: { userId: 'u1', walletId: '' }
			};
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/revoked',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('walletId is required');
		});

		it('returns already_revoked when no delegation exists for wallet', async () => {
			const payload = {
				eventName: 'wallet.delegation.revoked',
				userId: 'u1',
				data: { userId: 'u1', walletId: 'nonexistent-wallet' }
			};
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const res = await app.inject({
				method: 'POST',
				url: '/webhook/revoked',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().status).toBe('already_revoked');
		});
	});

	describe('GET /status/:userId', () => {
		it('returns inactive when no delegation exists', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/status/0xunknown',
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({
				active: false,
				hasCredentials: false,
				syncRequired: false
			});
		});

		it('returns active delegation status', async () => {
			// Create a delegation first
			const payload = validCreatedPayload();
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});

			const userId = payload.data.publicKey.toLowerCase();
			const res = await app.inject({
				method: 'GET',
				url: `/status/${userId}`,
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.active).toBe(true);
			expect(body.delegationId).toBeDefined();
			expect(body.walletAddress).toBe(userId);
		});
	});

	describe('GET /delegation/:delegationId', () => {
		it('returns 404 for non-existent delegation', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/delegation/nonexistent',
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(404);
			expect(res.json().error).toBe('Delegation not found');
		});

		it('returns delegation details', async () => {
			const payload = validCreatedPayload();
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			const createRes = await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});
			const { delegationId } = createRes.json();

			const res = await app.inject({
				method: 'GET',
				url: `/delegation/${delegationId}`,
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().id).toBe(delegationId);
			expect(res.json().status).toBe('active');
			expect(res.json().chainId).toBe(8453);
		});
	});

	describe('POST /activate', () => {
		it('returns 400 when userId or delegationId is missing', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/activate',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: { userId: '0xabc' }
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('userId and delegationId are required');
		});

		it('returns 400 when delegation does not exist', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/activate',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: { userId: '0xabc', delegationId: 'nonexistent' }
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe('POST /revoke', () => {
		it('returns 400 when userId is missing', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/revoke',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: {}
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('userId is required');
		});

		it('returns already_revoked when no active delegation', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/revoke',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: { userId: '0xunknown' }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().status).toBe('already_revoked');
		});
	});

	describe('GET /credentials/:userId', () => {
		it('returns 404 when no active delegation', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/credentials/0xunknown',
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(404);
			expect(res.json().error).toBe('No active delegation found for user');
		});

		it('returns credentials for active delegation', async () => {
			const payload = validCreatedPayload();
			const signature = createSignature(config.dynamicWebhookSecret, payload);
			await app.inject({
				method: 'POST',
				url: '/webhook/created',
				headers: {
					'x-internal-secret': config.internalSecret,
					'x-dynamic-signature-256': signature
				},
				payload
			});

			const userId = payload.data.publicKey.toLowerCase();
			const res = await app.inject({
				method: 'GET',
				url: `/credentials/${userId}`,
				headers: { 'x-internal-secret': config.internalSecret }
			});
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.walletId).toBe('wallet-1');
			expect(body.walletApiKey).toBe('mock-api-key');
			expect(body.chainId).toBe(8453);
		});
	});
});
