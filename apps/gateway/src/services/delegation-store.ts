import type { DelegationStatus } from '@quant-bot/shared-types';
import { encrypt, decrypt } from './delegation-crypto.js';

interface StoredDelegation {
	id: string;
	userId: string;
	walletId: string;
	walletAddress: string;
	encryptedWalletApiKey: string;
	encryptedKeyShare: string;
	iv: string;
	authTag: string;
	status: DelegationStatus;
	chainId: number;
	createdAt: number;
	expiresAt: number;
}

export interface DecryptedCredentials {
	walletId: string;
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

const delegations = new Map<string, StoredDelegation>();
const activeDelegations = new Map<string, string>();

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
	const { ciphertext, iv, authTag } = encrypt(combined, encryptionKey);

	delegations.set(id, {
		id,
		userId,
		walletId,
		walletAddress,
		encryptedWalletApiKey: ciphertext,
		encryptedKeyShare: '',
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

	if (delegation.status !== 'active' || delegation.expiresAt <= Date.now()) {
		if (delegation.expiresAt <= Date.now()) {
			delegation.status = 'expired';
		}
		activeDelegations.delete(userId);
		return undefined;
	}

	return delegation;
}

export function getDecryptedCredentials(delegationId: string, encryptionKey: string): DecryptedCredentials | undefined {
	const delegation = delegations.get(delegationId);
	if (!delegation) return undefined;

	if (delegation.status !== 'active' || delegation.expiresAt <= Date.now()) {
		return undefined;
	}

	const decrypted = decrypt(delegation.encryptedWalletApiKey, delegation.iv, delegation.authTag, encryptionKey);
	const { walletApiKey, keyShare } = JSON.parse(decrypted);

	return {
		walletId: delegation.walletId,
		walletApiKey,
		keyShare,
		chainId: delegation.chainId
	};
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

export function clearAll(): void {
	delegations.clear();
	activeDelegations.clear();
}
