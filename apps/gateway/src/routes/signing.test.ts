import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { signingProxyRoutes } from './signing.js';
import { createToken } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';

const config = {
	jwtSecret: 'test-secret-that-is-long-enough-for-hs256',
	jwtExpiry: '1h',
	toolsBaseUrl: 'https://tools.test',
	internalSecret: 'test-internal-secret'
} as GatewayConfig;

const USER_ID = '0xabc123';
const USER_ADDRESS = '0xABC123';

async function getToken(): Promise<string> {
	return createToken(USER_ADDRESS, USER_ID, config);
}

describe('signing proxy routes', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register((instance) => signingProxyRoutes(instance, config));
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	describe('GET /api/signing/:id', () => {
		it('returns 401 without auth token', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/api/signing/bundle-1'
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns signing bundle when user owns it', async () => {
			const bundle = { id: 'bundle-1', from: USER_ID, transactions: [] };
			vi.mocked(fetch).mockResolvedValue(new Response(
				JSON.stringify(bundle),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			));

			const token = await getToken();
			const res = await app.inject({
				method: 'GET',
				url: '/api/signing/bundle-1',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual(bundle);
		});

		it('returns 403 when bundle belongs to different user', async () => {
			const bundle = { id: 'bundle-1', from: '0xother-user', transactions: [] };
			vi.mocked(fetch).mockResolvedValue(new Response(
				JSON.stringify(bundle),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			));

			const token = await getToken();
			const res = await app.inject({
				method: 'GET',
				url: '/api/signing/bundle-1',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(403);
			expect(res.json().error).toBe('Bundle does not belong to this user');
		});

		it('forwards upstream error status', async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(
				JSON.stringify({ error: 'Not found' }),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			));

			const token = await getToken();
			const res = await app.inject({
				method: 'GET',
				url: '/api/signing/nonexistent',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe('POST /api/signing/:id/complete', () => {
		it('returns 401 without auth token', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/signing/bundle-1/complete',
				payload: { txHashes: ['0x123'] }
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns 400 when txHashes is missing', async () => {
			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/signing/bundle-1/complete',
				headers: { authorization: `Bearer ${token}` },
				payload: {}
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('txHashes array is required');
		});

		it('returns 400 when txHashes is empty array', async () => {
			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/signing/bundle-1/complete',
				headers: { authorization: `Bearer ${token}` },
				payload: { txHashes: [] }
			});
			expect(res.statusCode).toBe(400);
		});

		it('completes signing bundle successfully', async () => {
			const result = { status: 'completed', resolvedStrategyDeployment: null };
			vi.mocked(fetch).mockResolvedValue(new Response(
				JSON.stringify(result),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			));

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/signing/bundle-1/complete',
				headers: { authorization: `Bearer ${token}` },
				payload: { txHashes: ['0xhash1'] }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual(result);

			// Verify it forwards userId to tools service
			expect(fetch).toHaveBeenCalledWith(
				'https://tools.test/api/evm/signing/bundle-1/complete',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ userId: USER_ID, txHashes: ['0xhash1'] })
				})
			);
		});
	});
});
