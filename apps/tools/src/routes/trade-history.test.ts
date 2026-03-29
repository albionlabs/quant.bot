import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { tradeHistoryRoutes } from './trade-history.js';

vi.mock('../services/trade-history.js', () => ({
	fetchTradeHistory: vi.fn().mockResolvedValue({
		trades: [{ id: 't1', price: '1.5' }],
		total: 1
	})
}));

describe('GET /api/exchange/trades/:tokenAddress', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(tradeHistoryRoutes);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	it('returns trades for valid token address', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/trades/0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(200);
		expect(res.json().tokenAddress).toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
	});

	it('returns 400 for invalid token address', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/trades/not-valid'
		});

		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: 'Invalid token address' });
	});

	it('returns 400 for limit out of range', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/trades/0xABCDEF1234567890abcdef1234567890ABCDEF12?limit=0'
		});
		expect(res.statusCode).toBe(400);

		const res2 = await app.inject({
			method: 'GET',
			url: '/api/exchange/trades/0xABCDEF1234567890abcdef1234567890ABCDEF12?limit=200'
		});
		expect(res2.statusCode).toBe(400);
	});

	it('returns 500 when service throws', async () => {
		const { fetchTradeHistory } = await import('../services/trade-history.js');
		(fetchTradeHistory as any).mockRejectedValueOnce(new Error('Network failure'));

		const res = await app.inject({
			method: 'GET',
			url: '/api/exchange/trades/0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: 'Network failure' });
	});
});
