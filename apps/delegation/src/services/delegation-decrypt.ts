import { privateDecrypt, createDecipheriv, constants } from 'node:crypto';

export interface EncryptedDelegatedPayload {
	alg: string;
	iv: string;
	ct: string;
	tag: string;
	ek: string;
	kid?: string;
}

/**
 * Decrypts a hybrid RSA-OAEP + AES-256-GCM encrypted payload from Dynamic's
 * delegated access webhook.
 *
 * - `ek` is the AES key, encrypted with RSA-OAEP (SHA-256)
 * - `iv` is the AES-GCM initialization vector
 * - `ct` is the AES-GCM ciphertext
 * - `tag` is the AES-GCM auth tag
 */
function decryptPayload(privateKeyPem: string, payload: EncryptedDelegatedPayload): string {
	const aesKey = privateDecrypt(
		{
			key: privateKeyPem,
			oaepHash: 'sha256',
			padding: constants.RSA_PKCS1_OAEP_PADDING
		},
		Buffer.from(payload.ek, 'base64')
	);

	const decipher = createDecipheriv(
		'aes-256-gcm',
		aesKey,
		Buffer.from(payload.iv, 'base64')
	);
	decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(payload.ct, 'base64')),
		decipher.final()
	]);

	return decrypted.toString('utf8');
}

export function decryptDelegatedWebhookData({ privateKeyPem, encryptedDelegatedKeyShare, encryptedWalletApiKey }: {
	privateKeyPem: string;
	encryptedDelegatedKeyShare: EncryptedDelegatedPayload;
	encryptedWalletApiKey: EncryptedDelegatedPayload;
}): {
	decryptedDelegatedShare: unknown;
	decryptedWalletApiKey: string;
} {
	const shareJson = decryptPayload(privateKeyPem, encryptedDelegatedKeyShare);
	const apiKey = decryptPayload(privateKeyPem, encryptedWalletApiKey);

	return {
		decryptedDelegatedShare: JSON.parse(shareJson),
		decryptedWalletApiKey: apiKey
	};
}
