import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { npvRoutes } from './npv.js';

describe('POST /api/npv', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register(npvRoutes);
	});

	afterEach(async () => {
		await app.close();
	});

	it('returns NPV and IRR for valid input', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { cashFlows: [-1000, 300, 400, 500], discountRate: 0.1 }
		});

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.npv).toBeCloseTo(-21.04, 0);
		expect(body.irr).toBeCloseTo(0.0889, 2);
	});

	it('returns 400 when cashFlows is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { discountRate: 0.1 }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/cashFlows/);
	});

	it('returns 400 when cashFlows is empty', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { cashFlows: [], discountRate: 0.1 }
		});

		expect(res.statusCode).toBe(400);
	});

	it('returns 400 when discountRate is below -1', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { cashFlows: [-100, 50], discountRate: -2 }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/discountRate/);
	});

	it('returns 400 when discountRate is not a number', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { cashFlows: [-100, 50], discountRate: 'abc' }
		});

		expect(res.statusCode).toBe(400);
	});

	it('accepts discountRate of 0', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/npv',
			payload: { cashFlows: [-1000, 500, 500], discountRate: 0 }
		});

		expect(res.statusCode).toBe(200);
		expect(res.json().npv).toBe(0);
	});
});
