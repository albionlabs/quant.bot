import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { orderbookRoutes } from './orderbook.js';
import type { ToolsConfig } from '../config.js';

vi.mock('../services/orderbook.js', () => ({
	fetchOrderbookDepth: vi.fn().mockResolvedValue({
		buy: [{ price: '1.5', amount: '100' }],
		sell: [{ price: '1.6', amount: '200' }]
	})
}));

const config = {} as ToolsConfig;

describe('GET /api/exchange/orderbook/:tokenAddress', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register((instance) => orderbookRoutes(instance, config));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	it('returns orderbook for valid token address', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/orderbook/0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toHaveProperty('buy');
		expect(res.json()).toHaveProperty('sell');
	});

	it('returns 400 for invalid token address', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/orderbook/not-an-address'
		});

		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: 'Invalid token address' });
	});

	it('returns 400 for invalid side parameter', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/orderbook/0xABCDEF1234567890abcdef1234567890ABCDEF12?side=invalid'
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/side/);
	});

	it('accepts valid side parameters', async () => {
		for (const side of ['buy', 'sell', 'both']) {
			const res = await app.inject({
				method: 'GET',
				url: `/api/exchange/orderbook/0xABCDEF1234567890abcdef1234567890ABCDEF12?side=${side}`
			});
			expect(res.statusCode).toBe(200);
		}
	});

	it('returns 500 when service throws', async () => {
		const { fetchOrderbookDepth } = await import('../services/orderbook.js');
		(fetchOrderbookDepth as any).mockRejectedValueOnce(new Error('RPC timeout'));

		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/orderbook/0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: 'RPC timeout' });
	});
});
