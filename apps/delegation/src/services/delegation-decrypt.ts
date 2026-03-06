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

	const parsed = JSON.parse(shareJson);

	// === Phase 2: Raw share from Dynamic ===
	console.log('[delegation-decrypt] RAW SHARE FROM DYNAMIC:', {
		topLevelKeys: Object.keys(parsed),
		pubkeyType: typeof parsed?.pubkey,
		pubkeyKeys: parsed?.pubkey ? Object.keys(parsed.pubkey) : 'N/A',
		pubkeyPubkeyConstructor: parsed?.pubkey?.pubkey?.constructor?.name,
		pubkeyPubkeyIsUint8Array: parsed?.pubkey?.pubkey instanceof Uint8Array,
		pubkeyPubkeyType: typeof parsed?.pubkey?.pubkey,
		pubkeyPubkeyKeysSample: (() => {
			const inner = parsed?.pubkey?.pubkey;
			if (inner && typeof inner === 'object') {
				return Object.keys(inner).slice(0, 5);
			}
			return 'not-object';
		})(),
		secretShareType: typeof parsed?.secretShare,
		secretShareLen: parsed?.secretShare?.length,
	});

	return {
		decryptedDelegatedShare: parsed,
		decryptedWalletApiKey: apiKey
	};
}
