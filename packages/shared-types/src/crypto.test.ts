import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './crypto.js';

function createSignature(secret: string, payload: object): string {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	return `sha256=${hmac.digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
	const secret = 'webhook-secret';
	const payload = { event: 'test', data: { id: 1 } };

	it('returns true for valid signature', () => {
		const sig = createSignature(secret, payload);
		expect(verifyWebhookSignature(secret, sig, payload)).toBe(true);
	});

	it('returns false for wrong secret', () => {
		const sig = createSignature('wrong-secret', payload);
		expect(verifyWebhookSignature(secret, sig, payload)).toBe(false);
	});

	it('returns false for tampered payload', () => {
		const sig = createSignature(secret, payload);
		expect(verifyWebhookSignature(secret, sig, { event: 'tampered' })).toBe(false);
	});

	it('returns false for signature with wrong length', () => {
		expect(verifyWebhookSignature(secret, 'sha256=tooshort', payload)).toBe(false);
	});

	it('returns false for completely invalid signature', () => {
		expect(verifyWebhookSignature(secret, 'invalid', payload)).toBe(false);
	});
});
