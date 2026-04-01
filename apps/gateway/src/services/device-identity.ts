import {
	generateKeyPairSync,
	createHash,
	createPublicKey,
	createPrivateKey,
	sign
} from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface DeviceIdentity {
	deviceId: string;
	publicKeyPem: string;
	privateKeyPem: string;
}

export function loadOrCreateIdentity(filePath: string): DeviceIdentity {
	try {
		const data = JSON.parse(readFileSync(filePath, 'utf8'));
		if (data.version === 1 && data.publicKeyPem && data.privateKeyPem) {
			const deviceId = fingerprintPublicKey(data.publicKeyPem);
			console.log(`[device-identity] loaded existing identity ${deviceId.slice(0, 12)}… from ${filePath}`);
			return { deviceId, publicKeyPem: data.publicKeyPem, privateKeyPem: data.privateKeyPem };
		}
	} catch {
		// File doesn't exist or is invalid — generate new identity
	}

	const { publicKey, privateKey } = generateKeyPairSync('ed25519');
	const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
	const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
	const deviceId = fingerprintPublicKey(publicKeyPem);

	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify({
		version: 1,
		deviceId,
		publicKeyPem,
		privateKeyPem,
		createdAtMs: Date.now()
	}), { mode: 0o600 });

	console.log(`[device-identity] generated new identity ${deviceId.slice(0, 12)}… at ${filePath}`);
	return { deviceId, publicKeyPem, privateKeyPem };
}

function fingerprintPublicKey(publicKeyPem: string): string {
	const key = createPublicKey(publicKeyPem);
	const spkiDer = key.export({ type: 'spki', format: 'der' });
	// Ed25519 SPKI DER has a 12-byte prefix before the 32-byte raw public key
	const rawKey = spkiDer.subarray(12);
	return createHash('sha256').update(rawKey).digest('hex');
}

function getRawPublicKeyBase64Url(publicKeyPem: string): string {
	const key = createPublicKey(publicKeyPem);
	const spkiDer = key.export({ type: 'spki', format: 'der' });
	const rawKey = spkiDer.subarray(12);
	return rawKey.toString('base64url');
}

function signPayload(privateKeyPem: string, payload: string): string {
	const key = createPrivateKey(privateKeyPem);
	const signature = sign(null, Buffer.from(payload, 'utf8'), key);
	return signature.toString('base64url');
}

/** Matches OpenClaw's normalizeDeviceMetadataForAuth: trim + lowercase */
function normalizeMetadata(value?: string | null): string {
	if (!value) return '';
	const trimmed = value.trim();
	return trimmed ? trimmed.toLowerCase() : '';
}

export function buildDeviceAuth(
	identity: DeviceIdentity,
	params: {
		clientId: string;
		clientMode: string;
		role: string;
		scopes: string[];
		nonce: string;
		token: string;
		platform: string;
	}
): { id: string; publicKey: string; signature: string; signedAt: number; nonce: string } {
	const signedAt = Date.now();
	const payload = [
		'v3',
		identity.deviceId,
		params.clientId,
		params.clientMode,
		params.role,
		params.scopes.join(','),
		String(signedAt),
		params.token ?? '',
		params.nonce,
		normalizeMetadata(params.platform),
		normalizeMetadata(undefined) // deviceFamily — empty
	].join('|');

	return {
		id: identity.deviceId,
		publicKey: getRawPublicKeyBase64Url(identity.publicKeyPem),
		signature: signPayload(identity.privateKeyPem, payload),
		signedAt,
		nonce: params.nonce
	};
}
