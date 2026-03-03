import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './delegation-crypto.js';

const TEST_KEY = 'test-encryption-key-for-delegation-crypto';

describe('delegation-crypto', () => {
	it('encrypts and decrypts a round-trip successfully', () => {
		const plaintext = JSON.stringify({ walletApiKey: 'api-key-123', keyShare: 'share-abc' });
		const encrypted = encrypt(plaintext, TEST_KEY);

		expect(encrypted.ciphertext).toBeTruthy();
		expect(encrypted.iv).toBeTruthy();
		expect(encrypted.authTag).toBeTruthy();
		expect(encrypted.ciphertext).not.toBe(plaintext);

		const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag, TEST_KEY);
		expect(decrypted).toBe(plaintext);
	});

	it('fails to decrypt with wrong key', () => {
		const plaintext = 'secret data';
		const encrypted = encrypt(plaintext, TEST_KEY);

		expect(() =>
			decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag, 'wrong-key')
		).toThrow();
	});

	it('fails to decrypt tampered ciphertext', () => {
		const plaintext = 'secret data';
		const encrypted = encrypt(plaintext, TEST_KEY);

		const tampered = 'aa' + encrypted.ciphertext.slice(2);
		expect(() =>
			decrypt(tampered, encrypted.iv, encrypted.authTag, TEST_KEY)
		).toThrow();
	});

	it('produces different ciphertexts for same plaintext (random IV)', () => {
		const plaintext = 'same input';
		const a = encrypt(plaintext, TEST_KEY);
		const b = encrypt(plaintext, TEST_KEY);

		expect(a.ciphertext).not.toBe(b.ciphertext);
		expect(a.iv).not.toBe(b.iv);
	});
});
