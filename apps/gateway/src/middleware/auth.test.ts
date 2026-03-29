import { describe, it, expect } from 'vitest';
import { createToken, verifyToken } from './auth.js';
import type { GatewayConfig } from '../config.js';

const config = {
	jwtSecret: 'test-secret-that-is-long-enough-for-hs256',
	jwtExpiry: '1h'
} as GatewayConfig;

describe('auth middleware', () => {
	it('creates and verifies a valid JWT', async () => {
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', config);
		expect(typeof token).toBe('string');

		const payload = await verifyToken(token, config);
		expect(payload.sub).toBe('user-1');
		expect(payload.address).toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
		expect(payload.exp).toBeGreaterThan(payload.iat);
	});

	it('rejects tampered token', async () => {
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', config);
		const tampered = token.slice(0, -5) + 'xxxxx';

		await expect(verifyToken(tampered, config)).rejects.toThrow();
	});

	it('rejects token signed with different secret', async () => {
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', config);
		const otherConfig = { ...config, jwtSecret: 'different-secret-for-jwt-verification' };

		await expect(verifyToken(token, otherConfig)).rejects.toThrow();
	});

	it('rejects expired token', async () => {
		const shortConfig = { ...config, jwtExpiry: '0s' } as GatewayConfig;
		const token = await createToken('0xABCDEF1234567890abcdef1234567890ABCDEF12', 'user-1', shortConfig);

		// Token with 0s expiry should be expired immediately
		await expect(verifyToken(token, shortConfig)).rejects.toThrow();
	});
});
