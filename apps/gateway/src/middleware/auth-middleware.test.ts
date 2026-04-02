import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { createToken, authMiddleware } from './auth.js';
import type { GatewayConfig } from '../config.js';

const config = {
	jwtSecret: 'test-secret-that-is-long-enough-for-hs256',
	jwtExpiry: '1h'
} as GatewayConfig;

describe('authMiddleware', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		app.addHook('preHandler', authMiddleware(config));
		app.get('/protected', async (request) => {
			const user = (request as any).user;
			return { sub: user.sub, address: user.address };
		});
	});

	afterEach(async () => {
		await app.close();
	});

	it('allows request with valid Bearer token', async () => {
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', config);

		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: `Bearer ${token}` }
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({
			sub: 'user-1',
			address: '0xABCDEF1234567890abcdef1234567890ABCDEF12'
		});
	});

	it('returns 401 when Authorization header is missing', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/protected'
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Missing or invalid authorization header' });
	});

	it('returns 401 when Authorization header is not Bearer', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: 'Basic dXNlcjpwYXNz' }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Missing or invalid authorization header' });
	});

	it('returns 401 for expired token', async () => {
		const shortConfig = { ...config, jwtExpiry: '0s' } as GatewayConfig;
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', shortConfig);

		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: `Bearer ${token}` }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Invalid or expired token' });
	});

	it('returns 401 for tampered token', async () => {
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', config);
		const tampered = token.slice(0, -5) + 'xxxxx';

		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: `Bearer ${tampered}` }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Invalid or expired token' });
	});

	it('returns 401 for token signed with different secret', async () => {
		const otherConfig = { ...config, jwtSecret: 'different-secret-for-jwt-verification' } as GatewayConfig;
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', otherConfig);

		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: `Bearer ${token}` }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Invalid or expired token' });
	});

	it('returns 401 for empty Bearer value', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/protected',
			headers: { authorization: 'Bearer ' }
		});

		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: 'Invalid or expired token' });
	});
});
