import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { tokenRegistryRoutes } from './token-registry.js';

vi.mock('../services/token-registry.js', () => ({
	getAllTokens: vi.fn().mockResolvedValue({
		name: 'test-list',
		tokens: [
			{ symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' }
		]
	}),
	lookupToken: vi.fn().mockImplementation(async (query: string) => {
		if (query === 'WETH' || query === '0x4200000000000000000000000000000000000006') {
			return { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' };
		}
		return null;
	})
}));

describe('token-registry routes', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(tokenRegistryRoutes);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	describe('GET /api/tokens', () => {
		it('returns all tokens', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/api/tokens'
			});

			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.name).toBe('test-list');
			expect(body.tokens).toHaveLength(1);
			expect(body.updatedAt).toBeDefined();
		});
	});

	describe('GET /api/tokens/:symbolOrAddress', () => {
		it('returns token by symbol', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/api/tokens/WETH'
			});

			expect(res.statusCode).toBe(200);
			expect(res.json().token.symbol).toBe('WETH');
		});

		it('returns token by address', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/api/tokens/0x4200000000000000000000000000000000000006'
			});

			expect(res.statusCode).toBe(200);
			expect(res.json().token.symbol).toBe('WETH');
		});

		it('returns 404 for unknown token', async () => {
			const res = await app.inject({
				method: 'GET',
				url: '/api/tokens/UNKNOWN'
			});

			expect(res.statusCode).toBe(404);
			expect(res.json().error).toMatch(/Token not found/);
		});
	});
});
