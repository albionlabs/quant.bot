import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { authRoutes } from './auth.js';
import { createToken } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';

let siweVerifyResult: {
	success: boolean;
	data?: { address: string };
} | Error = {
	success: true,
	data: { address: '0xABCDEF1234567890abcdef1234567890ABCDEF12' }
};

vi.mock('siwe', () => {
	return {
		SiweMessage: class MockSiweMessage {
			constructor(_message: string) {}
			async verify() {
				if (siweVerifyResult instanceof Error) throw siweVerifyResult;
				return siweVerifyResult;
			}
		}
	};
});

const config = {
	jwtSecret: 'test-secret-that-is-long-enough-for-hs256',
	jwtExpiry: '1h',
	apiKeys: []
} as unknown as GatewayConfig;

describe('auth routes', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		siweVerifyResult = {
			success: true,
			data: { address: '0xABCDEF1234567890abcdef1234567890ABCDEF12' }
		};
		app = Fastify();
		await app.register((instance) => authRoutes(instance, config));
	});

	afterEach(async () => {
		await app.close();
	});

	describe('POST /api/auth/login', () => {
		it('returns 400 when required fields are missing', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: { signature: 'sig' }
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('signature, message, and address are required');
		});

		it('returns token on successful login', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: {
					signature: '0xsig',
					message: 'Sign in to quant.bot with 0xABCDEF1234567890abcdef1234567890ABCDEF12',
					address: '0xABCDEF1234567890abcdef1234567890ABCDEF12'
				}
			});
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body.token).toBeDefined();
			expect(body.user.id).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
			expect(body.user.address).toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
		});

		it('returns 401 when signature is invalid', async () => {
			siweVerifyResult = { success: false };

			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: {
					signature: '0xbadsig',
					message: 'Sign in',
					address: '0xABCDEF1234567890abcdef1234567890ABCDEF12'
				}
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Invalid signature');
		});

		it('returns 401 when address does not match', async () => {
			siweVerifyResult = {
				success: true,
				data: { address: '0x1111111111111111111111111111111111111111' }
			};

			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: {
					signature: '0xsig',
					message: 'Sign in',
					address: '0x2222222222222222222222222222222222222222'
				}
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Address mismatch');
		});

		it('returns 401 when SIWE throws an exception', async () => {
			siweVerifyResult = new Error('malformed message');

			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: {
					signature: '0xsig',
					message: 'bad-message',
					address: '0xABCDEF1234567890abcdef1234567890ABCDEF12'
				}
			});
			expect(res.statusCode).toBe(401);
			expect(res.json().error).toBe('Signature verification failed');
		});
	});

	describe('POST /api/auth/refresh', () => {
		it('returns 401 without auth token', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/refresh'
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns a valid token on refresh', async () => {
			const token = await createToken(
				'0xABCDEF1234567890abcdef1234567890ABCDEF12',
				'user-1',
				config
			);

			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/refresh',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().token).toBeDefined();
			expect(typeof res.json().token).toBe('string');
		});
	});

	describe('API key middleware', () => {
		it('returns 403 without API key when apiKeys are configured', async () => {
			const keyConfig = { ...config, apiKeys: ['test-key-1'] } as unknown as GatewayConfig;
			const keyApp = Fastify();
			await keyApp.register((instance) => authRoutes(instance, keyConfig));

			const res = await keyApp.inject({
				method: 'POST',
				url: '/api/auth/login',
				payload: {
					signature: '0xsig',
					message: 'msg',
					address: '0xABCDEF1234567890abcdef1234567890ABCDEF12'
				}
			});
			expect(res.statusCode).toBe(403);
			expect(res.json().error).toBe('Invalid or missing API key');

			await keyApp.close();
		});
	});
});
