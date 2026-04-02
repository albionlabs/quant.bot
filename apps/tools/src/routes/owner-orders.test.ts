import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { ownerOrdersRoutes } from './owner-orders.js';

vi.mock('../services/owner-orders.js', () => ({
	fetchOwnerOrders: vi.fn().mockResolvedValue([
		{ id: 'order-1', owner: '0xabc' }
	])
}));

describe('GET /api/orders', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(ownerOrdersRoutes);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	it('returns orders for valid owner', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/orders?owner=0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.owner).toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
		expect(body.orders).toHaveLength(1);
		expect(body.total).toBe(1);
	});

	it('returns 400 when owner is missing', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/orders'
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/owner/);
	});

	it('returns 400 for invalid owner address', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/orders?owner=not-an-address'
		});

		expect(res.statusCode).toBe(400);
	});

	it('returns 400 for limit out of range', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/orders?owner=0xABCDEF1234567890abcdef1234567890ABCDEF12&limit=0'
		});
		expect(res.statusCode).toBe(400);

		const res2 = await app.inject({
			method: 'GET',
			url: '/api/orders?owner=0xABCDEF1234567890abcdef1234567890ABCDEF12&limit=101'
		});
		expect(res2.statusCode).toBe(400);
	});

	it('returns 500 when service throws', async () => {
		const { fetchOwnerOrders } = await import('../services/owner-orders.js');
		(fetchOwnerOrders as any).mockRejectedValueOnce(new Error('GraphQL error'));

		const res = await app.inject({
			method: 'GET',
			url: '/api/orders?owner=0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: 'GraphQL error' });
	});
});
