import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { evmSimulateRoutes } from './evm-simulate.js';
import type { ToolsConfig } from '../config.js';

vi.mock('../services/evm-simulator.js', () => ({
	simulateTransaction: vi.fn().mockResolvedValue({
		success: true,
		gasUsed: '21000',
		returnData: '0x'
	})
}));

const config = {
	rpcUrl: 'https://rpc.test',
	chainName: 'base'
} as ToolsConfig;

describe('POST /api/evm/simulate', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register((instance) => evmSimulateRoutes(instance, config));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await app.close();
	});

	it('returns simulation result for valid request', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/evm/simulate',
			payload: { to: '0xABCDEF1234567890abcdef1234567890ABCDEF12' }
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({
			success: true,
			gasUsed: '21000',
			returnData: '0x'
		});
	});

	it('returns 400 for invalid to address', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/evm/simulate',
			payload: { to: 'not-an-address' }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: 'Invalid "to" address' });
	});

	it('returns 400 when to is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/evm/simulate',
			payload: {}
		});

		expect(res.statusCode).toBe(400);
	});

	it('returns 500 when simulation throws', async () => {
		const { simulateTransaction } = await import('../services/evm-simulator.js');
		(simulateTransaction as any).mockRejectedValueOnce(new Error('Reverted'));

		const res = await app.inject({
			method: 'POST',
			url: '/api/evm/simulate',
			payload: { to: '0xABCDEF1234567890abcdef1234567890ABCDEF12' }
		});

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: 'Reverted' });
	});
});
