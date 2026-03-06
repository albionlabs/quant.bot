import { createHash } from 'node:crypto';
import type { DelegationStatus } from '@quant-bot/shared-types';
import { encrypt, decrypt } from './delegation-crypto.js';

export function fp(value: unknown): string {
	if (value === undefined || value === null) return 'null';
	const str = typeof value === 'string' ? value : JSON.stringify(value);
	return createHash('sha256').update(str).digest('hex').substring(0, 12);
}

interface StoredDelegation {
	id: string;
	userId: string;
	walletId: string;
	walletAddress: string;
	encryptedCredentials: string;
	iv: string;
	authTag: string;
	status: DelegationStatus;
	chainId: number;
	createdAt: number;
	expiresAt: number;
}

export interface DecryptedCredentials {
	walletId: string;
	walletAddress: string;
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

export interface CredentialHealth {
	hasCredentials: boolean;
	reason?: string;
}

const delegations = new Map<string, StoredDelegation>();
const activeDelegations = new Map<string, string>();

interface ParsedCredentialBlob {
	walletApiKey: string;
	keyShare: string;
	decrypted: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateKeyShareShape(keyShare: string): string | undefined {
	let parsedKeyShare: unknown;
	try {
		parsedKeyShare = JSON.parse(keyShare);
	} catch {
		return 'invalid_key_share_json';
	}

	if (!isRecord(parsedKeyShare)) {
		return 'invalid_key_share_shape';
	}

	if (typeof parsedKeyShare.secretShare !== 'string' || parsedKeyShare.secretShare.length === 0) {
		return 'missing_secret_share';
	}

	if (!isRecord(parsedKeyShare.pubkey)) {
		return 'missing_pubkey';
	}

	const innerPubkey = parsedKeyShare.pubkey.pubkey;
	if (!innerPubkey) {
		return 'missing_pubkey_bytes';
	}

	if (innerPubkey instanceof Uint8Array) {
		return innerPubkey.length > 0 ? undefined : 'empty_pubkey_bytes';
	}

	if (Array.isArray(innerPubkey)) {
		return innerPubkey.length > 0 ? undefined : 'empty_pubkey_bytes';
	}

	if (!isRecord(innerPubkey)) {
		return 'invalid_pubkey_bytes_shape';
	}

	return Object.keys(innerPubkey).length > 0 ? undefined : 'empty_pubkey_bytes';
}

function parseCredentialBlob(
	delegation: StoredDelegation,
	encryptionKey: string
): { ok: true; value: ParsedCredentialBlob } | { ok: false; reason: string } {
	let decrypted: string;
	try {
		decrypted = decrypt(delegation.encryptedCredentials, delegation.iv, delegation.authTag, encryptionKey);
	} catch {
		return { ok: false, reason: 'decrypt_failed' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(decrypted);
	} catch {
		return { ok: false, reason: 'invalid_credentials_json' };
	}

	if (!isRecord(parsed)) {
		return { ok: false, reason: 'invalid_credentials_shape' };
	}

	const walletApiKey = parsed.walletApiKey;
	if (typeof walletApiKey !== 'string' || walletApiKey.length === 0) {
		return { ok: false, reason: 'missing_wallet_api_key' };
	}

	const keyShare = parsed.keyShare;
	if (typeof keyShare !== 'string' || keyShare.length === 0) {
		return { ok: false, reason: 'missing_key_share' };
	}

	const keyShareShapeError = validateKeyShareShape(keyShare);
	if (keyShareShapeError) {
		return { ok: false, reason: keyShareShapeError };
	}

	return {
		ok: true,
		value: {
			walletApiKey,
			keyShare,
			decrypted
		}
	};
}

export function storeDelegation(
	id: string,
	userId: string,
	walletId: string,
	walletAddress: string,
	walletApiKey: string,
	keyShare: string,
	encryptionKey: string,
	chainId: number,
	ttlMs: number
): void {
	const combined = JSON.stringify({ walletApiKey, keyShare });

	console.log('[delegation-store] PRE_STORE:', {
		delegationId: id,
		combinedLength: combined.length,
		keyShareLength: keyShare.length,
		fp_combined: fp(combined),
		fp_keyShare: fp(keyShare),
		fp_walletApiKey: fp(walletApiKey)
	});

	const { ciphertext, iv, authTag } = encrypt(combined, encryptionKey);

	delegations.set(id, {
		id,
		userId,
		walletId,
		walletAddress,
		encryptedCredentials: ciphertext,
		iv,
		authTag,
		status: 'active',
		chainId,
		createdAt: Date.now(),
		expiresAt: Date.now() + ttlMs
	});
}

export function getActiveDelegation(userId: string): StoredDelegation | undefined {
	const delegationId = activeDelegations.get(userId);
	if (!delegationId) return undefined;

	const delegation = delegations.get(delegationId);
	if (!delegation) return undefined;

	if (delegation.expiresAt <= Date.now()) {
		delegation.status = 'expired';
		activeDelegations.delete(userId);
		return undefined;
	}

	if (delegation.status !== 'active') {
		activeDelegations.delete(userId);
		return undefined;
	}

	return delegation;
}

export function getDecryptedCredentials(
	delegationId: string,
	encryptionKey: string,
	attemptId?: string
): DecryptedCredentials | undefined {
	const delegation = delegations.get(delegationId);
	if (!delegation) return undefined;

	if (delegation.status !== 'active' || delegation.expiresAt <= Date.now()) {
		return undefined;
	}

	const tag = attemptId ? `[creds:${attemptId}]` : '[creds]';
	const parsed = parseCredentialBlob(delegation, encryptionKey);
	if (!parsed.ok) {
		console.warn(`${tag} INVALID_CREDENTIALS:`, {
			delegationId: delegation.id,
			reason: parsed.reason,
			walletId: delegation.walletId,
			walletAddress: delegation.walletAddress
		});
		return undefined;
	}

	const { walletApiKey, keyShare, decrypted } = parsed.value;

	console.log(`${tag} POST_LOAD:`, {
		decryptedLen: decrypted.length,
		fp_decrypted: fp(decrypted),
		keyShareLen: keyShare.length,
		fp_keyShare: fp(keyShare),
		fp_walletApiKey: fp(walletApiKey),
		walletId: delegation.walletId,
		walletAddress: delegation.walletAddress,
		chainId: delegation.chainId,
		delegationId: delegation.id,
		delegationAge: Date.now() - delegation.createdAt
	});

	return {
		walletId: delegation.walletId,
		walletAddress: delegation.walletAddress,
		walletApiKey,
		keyShare,
		chainId: delegation.chainId
	};
}

export function getCredentialHealth(
	delegationId: string,
	encryptionKey: string
): CredentialHealth {
	const delegation = delegations.get(delegationId);
	if (!delegation) {
		return { hasCredentials: false, reason: 'delegation_not_found' };
	}

	if (delegation.status !== 'active' || delegation.expiresAt <= Date.now()) {
		return { hasCredentials: false, reason: 'delegation_inactive' };
	}

	const parsed = parseCredentialBlob(delegation, encryptionKey);
	if (!parsed.ok) {
		return { hasCredentials: false, reason: parsed.reason };
	}

	return { hasCredentials: true };
}

export function activateDelegation(userId: string, delegationId: string): boolean {
	const delegation = delegations.get(delegationId);
	if (!delegation) return false;
	if (delegation.userId !== userId) return false;
	if (delegation.status !== 'active' || delegation.expiresAt <= Date.now()) return false;

	activeDelegations.set(userId, delegationId);
	return true;
}

export function revokeDelegation(delegationId: string): boolean {
	const delegation = delegations.get(delegationId);
	if (!delegation) return false;

	delegation.status = 'revoked';
	const activeId = activeDelegations.get(delegation.userId);
	if (activeId === delegationId) {
		activeDelegations.delete(delegation.userId);
	}
	return true;
}

export function isDelegationActive(userId: string): boolean {
	return getActiveDelegation(userId) !== undefined;
}

export function getDelegation(delegationId: string): StoredDelegation | undefined {
	return delegations.get(delegationId);
}

export function revokeByWalletId(walletId: string, graceMs = 0): boolean {
	const cutoff = Date.now() - graceMs;
	let revoked = false;
	for (const delegation of delegations.values()) {
		if (delegation.walletId !== walletId) continue;
		if (delegation.status !== 'active') continue;
		if (graceMs > 0 && delegation.createdAt > cutoff) continue;
		if (revokeDelegation(delegation.id)) {
			revoked = true;
		}
	}
	return revoked;
}

export function clearAll(): void {
	delegations.clear();
	activeDelegations.clear();
}
