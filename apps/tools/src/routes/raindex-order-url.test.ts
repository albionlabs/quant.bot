import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { raindexOrderUrlRoutes } from './raindex-order-url.js';

describe('GET /api/raindex/order-url/:orderHash', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(raindexOrderUrlRoutes);
	});

	afterEach(async () => {
		await app.close();
	});

	it('returns URL for valid order hash', async () => {
		const hash = '0x' + 'ab'.repeat(32);
		const res = await app.inject({
			method: 'GET',
			url: `/api/raindex/order-url/${hash}`
		});

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.url).toContain(hash);
		expect(body.orderHash).toBe(hash);
		expect(body.chainId).toBeTypeOf('number');
	});

	it('returns 400 for invalid order hash', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/raindex/order-url/not-a-hash'
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/orderHash/);
	});

	it('returns 400 for short hex string', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/api/raindex/order-url/0xabcdef'
		});

		expect(res.statusCode).toBe(400);
	});

	it('returns 400 for invalid chainId query param', async () => {
		const hash = '0x' + 'ab'.repeat(32);
		const res = await app.inject({
			method: 'GET',
			url: `/api/raindex/order-url/${hash}?chainId=abc`
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/chainId/);
	});

	it('accepts custom chainId and orderbook', async () => {
		const hash = '0x' + 'ab'.repeat(32);
		const res = await app.inject({
			method: 'GET',
			url: `/api/raindex/order-url/${hash}?chainId=8453&orderbook=0x1234567890abcdef1234567890abcdef12345678`
		});

		expect(res.statusCode).toBe(200);
		expect(res.json().chainId).toBe(8453);
	});
});
