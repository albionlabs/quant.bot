import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'quant-bot-delegation-v1';

export interface EncryptedData {
	ciphertext: string;
	iv: string;
	authTag: string;
}

function deriveKey(encryptionKey: string): Buffer {
	return scryptSync(encryptionKey, SALT, KEY_LENGTH);
}

export function encrypt(plaintext: string, encryptionKey: string): EncryptedData {
	const key = deriveKey(encryptionKey);
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
	ciphertext += cipher.final('hex');
	const authTag = cipher.getAuthTag().toString('hex');

	return {
		ciphertext,
		iv: iv.toString('hex'),
		authTag
	};
}

export function decrypt(ciphertext: string, iv: string, authTag: string, encryptionKey: string): string {
	const key = deriveKey(encryptionKey);
	const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
	decipher.setAuthTag(Buffer.from(authTag, 'hex'));

	let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
	plaintext += decipher.final('utf8');

	return plaintext;
}
