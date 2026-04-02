import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { webhookRoutes } from './webhook.js';
import type { GatewayConfig } from '../config.js';

function createSignature(secret: string, payload: object): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	return 'sha256=' + hmac.digest('hex');
}

const config = {
	dynamicWebhookSecret: 'test-webhook-secret',
	delegationServiceUrl: 'https://delegation.test',
	internalSecret: 'test-internal-secret'
} as GatewayConfig;

describe('webhook route', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register((instance) => webhookRoutes(instance, config));
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ delegationId: 'del-1' })
		}));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	it('returns 401 when signature header is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			payload: { eventName: 'wallet.delegation.created' }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Missing webhook signature' });
	});

	it('returns 401 when signature is invalid', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
			payload: { eventName: 'wallet.delegation.created' }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Invalid webhook signature' });
	});

	it('returns 400 for unknown event types', async () => {
		const payload = { eventName: 'unknown.event' };
		const signature = createSignature(config.dynamicWebhookSecret, payload);

		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': signature },
			payload
		});

		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: 'Unknown event: unknown.event' });
	});

	it('forwards wallet.delegation.created to delegation service', async () => {
		const payload = { eventName: 'wallet.delegation.created', walletId: 'w1' };
		const signature = createSignature(config.dynamicWebhookSecret, payload);

		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': signature },
			payload
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ delegationId: 'del-1' });
		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledWith(
			'https://delegation.test/webhook/created',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Type': 'application/json',
					'X-Internal-Secret': 'test-internal-secret',
					'X-Dynamic-Signature-256': signature
				}),
				body: JSON.stringify(payload)
			})
		);
	});

	it('forwards wallet.delegation.revoked to delegation service', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'revoked' })
		}));

		const payload = { eventName: 'wallet.delegation.revoked', walletId: 'w1' };
		const signature = createSignature(config.dynamicWebhookSecret, payload);

		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': signature },
			payload
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: 'revoked' });
		expect(fetch).toHaveBeenCalledWith(
			'https://delegation.test/webhook/revoked',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(payload)
			})
		);
	});

	it('returns 502 when delegation service fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

		const payload = { eventName: 'wallet.delegation.created', walletId: 'w1' };
		const signature = createSignature(config.dynamicWebhookSecret, payload);

		const res = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': signature },
			payload
		});

		expect(res.statusCode).toBe(502);
		expect(res.json()).toEqual({ error: 'Delegation service error' });
	});

	it('validates signature using the actual verifyWebhookSignature (timing-safe)', async () => {
		const payload = { eventName: 'wallet.delegation.created', walletId: 'w1' };
		// Signature computed with the correct secret should pass
		const validSig = createSignature(config.dynamicWebhookSecret, payload);
		// Signature computed with a wrong secret should fail
		const wrongSig = createSignature('wrong-secret', payload);

		const validRes = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': validSig },
			payload
		});
		expect(validRes.statusCode).toBe(200);

		const invalidRes = await app.inject({
			method: 'POST',
			url: '/api/webhooks/dynamic',
			headers: { 'x-dynamic-signature-256': wrongSig },
			payload
		});
		expect(invalidRes.statusCode).toBe(401);
	});
});
