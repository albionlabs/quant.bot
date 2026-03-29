import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, publicEncrypt, createCipheriv, randomBytes, constants } from 'node:crypto';
import { decryptDelegatedWebhookData, type EncryptedDelegatedPayload } from './delegation-decrypt.js';

// Generate an ephemeral RSA key pair for testing
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	publicKeyEncoding: { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

/**
 * Encrypt a string using the same hybrid RSA-OAEP + AES-256-GCM scheme
 * that Dynamic uses in production webhooks.
 */
function encryptPayload(plaintext: string): EncryptedDelegatedPayload {
	const aesKey = randomBytes(32);
	const iv = randomBytes(12);

	const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	const ek = publicEncrypt(
		{ key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
		aesKey
	);

	return {
		alg: 'RSA-OAEP-256',
		iv: iv.toString('base64'),
		ct: ct.toString('base64'),
		tag: tag.toString('base64'),
		ek: ek.toString('base64')
	};
}

describe('decryptDelegatedWebhookData', () => {
	const validKeyShare = JSON.stringify({
		pubkey: { pubkey: { 0: 1, 1: 2 } },
		secretShare: 'test-secret-share'
	});

	it('decrypts valid delegation webhook data', () => {
		const result = decryptDelegatedWebhookData({
			privateKeyPem: privateKey,
			encryptedDelegatedKeyShare: encryptPayload(validKeyShare),
			encryptedWalletApiKey: encryptPayload('my-api-key-123')
		});

		expect(result.decryptedDelegatedShare).toEqual(JSON.parse(validKeyShare));
		expect(result.decryptedWalletApiKey).toBe('my-api-key-123');
	});

	it('throws when private key is wrong', () => {
		const { privateKey: wrongKey } = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: { type: 'spki', format: 'pem' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
		});

		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: wrongKey,
				encryptedDelegatedKeyShare: encryptPayload(validKeyShare),
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow();
	});

	it('throws when key share is not valid JSON', () => {
		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encryptPayload('not-json{{{'),
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow('Delegated key share payload is not valid JSON');
	});

	it('throws when key share is not an object', () => {
		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encryptPayload(JSON.stringify([1, 2, 3])),
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow('Delegated key share payload has invalid shape');
	});

	it('throws when key share is a string', () => {
		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encryptPayload(JSON.stringify('just-a-string')),
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow('Delegated key share payload has invalid shape');
	});

	it('throws when wallet API key is empty', () => {
		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encryptPayload(validKeyShare),
				encryptedWalletApiKey: encryptPayload('')
			})
		).toThrow('Delegated wallet API key payload is empty');
	});

	it('throws when auth tag is tampered', () => {
		const encrypted = encryptPayload(validKeyShare);
		// Flip bits in the auth tag
		const tagBuf = Buffer.from(encrypted.tag, 'base64');
		tagBuf[0] ^= 0xff;
		encrypted.tag = tagBuf.toString('base64');

		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encrypted,
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow();
	});

	it('throws when ciphertext is tampered', () => {
		const encrypted = encryptPayload(validKeyShare);
		const ctBuf = Buffer.from(encrypted.ct, 'base64');
		ctBuf[0] ^= 0xff;
		encrypted.ct = ctBuf.toString('base64');

		expect(() =>
			decryptDelegatedWebhookData({
				privateKeyPem: privateKey,
				encryptedDelegatedKeyShare: encrypted,
				encryptedWalletApiKey: encryptPayload('key')
			})
		).toThrow();
	});
});
