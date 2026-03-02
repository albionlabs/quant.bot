import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

function createSignature(secret: string, payload: object): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	return 'sha256=' + hmac.digest('hex');
}

describe('webhook signature verification', () => {
	const secret = 'test-webhook-secret';

	it('generates valid HMAC-SHA256 signature', () => {
		const payload = { walletId: 'w1', userId: '0xabc' };
		const sig = createSignature(secret, payload);

		expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
	});

	it('produces different signatures for different payloads', () => {
		const sig1 = createSignature(secret, { a: 1 });
		const sig2 = createSignature(secret, { a: 2 });

		expect(sig1).not.toBe(sig2);
	});

	it('produces different signatures for different secrets', () => {
		const payload = { walletId: 'w1' };
		const sig1 = createSignature('secret-a', payload);
		const sig2 = createSignature('secret-b', payload);

		expect(sig1).not.toBe(sig2);
	});

	it('produces consistent signatures for same input', () => {
		const payload = { walletId: 'w1', userId: '0xabc' };
		const sig1 = createSignature(secret, payload);
		const sig2 = createSignature(secret, payload);

		expect(sig1).toBe(sig2);
	});
});
