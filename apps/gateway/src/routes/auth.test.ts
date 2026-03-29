import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';
import { authRoutes } from './auth.js';
import type { GatewayConfig } from '../config.js';

function makeConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
	return {
		port: 3000,
		host: '0.0.0.0',
		jwtSecret: 'test-secret-that-is-long-enough-for-hs256-signing',
		jwtExpiry: '1h',
		agentWsUrl: 'ws://localhost:18789',
		agentResponseTimeoutMs: 5000,
		executionTokenTtlSeconds: 300,
		openclawGatewayToken: 'test-token',
		rateLimitMax: 100,
		rateLimitWindow: 60000,
		authRateLimitMax: 10,
		corsOrigin: ['http://localhost'],
		delegationServiceUrl: 'http://localhost:5000',
		internalSecret: 'internal-secret',
		dynamicWebhookSecret: 'webhook-secret',
		toolsBaseUrl: 'http://localhost:4000',
		tokenMetricsEnabled: false,
		tokenMetricsMaxRuns: 100,
		apiKeys: [],
		...overrides
	};
}

async function buildSiwePayload(wallet: Wallet) {
	const address = wallet.address;
	const nonce = 'testnonce12345678';
	const domain = 'localhost';
	const uri = 'http://localhost';

	const siweMessage = new SiweMessage({
		domain,
		address,
		statement: 'Sign in to test',
		uri,
		version: '1',
		chainId: 1,
		nonce
	});

	const message = siweMessage.prepareMessage();
	const signature = await wallet.signMessage(message);

	return { signature, message, address };
}

describe('POST /api/auth/login', () => {
	let app: FastifyInstance;
	let wallet: Wallet;

	beforeEach(async () => {
		wallet = Wallet.createRandom();
		app = Fastify();
		await authRoutes(app, makeConfig());
		await app.ready();
	});

	it('returns a JWT on valid SIWE signature', async () => {
		const { signature, message, address } = await buildSiwePayload(wallet);

		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature, message, address }
		});

		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.token).toBeDefined();
		expect(typeof body.token).toBe('string');
		expect(body.user).toBeDefined();
		expect(body.user.address).toBe(address);
		expect(body.user.id).toBe(address.toLowerCase());
	});

	it('returns 400 when signature is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { message: 'test', address: '0x1234' }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/signature.*required/i);
	});

	it('returns 400 when message is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature: '0xabc', address: '0x1234' }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/message.*required/i);
	});

	it('returns 400 when address is missing', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature: '0xabc', message: 'test' }
		});

		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/address.*required/i);
	});

	it('returns 401 for an invalid signature', async () => {
		const { message, address } = await buildSiwePayload(wallet);
		const badSignature = '0x' + 'ab'.repeat(65);

		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature: badSignature, message, address }
		});

		expect(res.statusCode).toBe(401);
	});

	it('returns 401 when address does not match signer', async () => {
		const { signature, message } = await buildSiwePayload(wallet);
		const otherWallet = Wallet.createRandom();

		const res = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature, message, address: otherWallet.address }
		});

		expect(res.statusCode).toBe(401);
	});

	it('requires API key when apiKeys are configured', async () => {
		const securedApp = Fastify();
		await authRoutes(securedApp, makeConfig({ apiKeys: ['secret-key'] }));
		await securedApp.ready();

		const { signature, message, address } = await buildSiwePayload(wallet);

		// Without API key
		const res1 = await securedApp.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { signature, message, address }
		});
		expect(res1.statusCode).toBe(403);

		// With correct API key
		const res2 = await securedApp.inject({
			method: 'POST',
			url: '/api/auth/login',
			headers: { 'x-api-key': 'secret-key' },
			payload: { signature, message, address }
		});
		expect(res2.statusCode).toBe(200);
	});
});
