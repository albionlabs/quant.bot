import { describe, it, expect, beforeEach } from 'vitest';
import {
	storeDelegation,
	getActiveDelegation,
	getDecryptedCredentials,
	getCredentialHealth,
	activateDelegation,
	revokeDelegation,
	revokeByWalletId,
	isDelegationActive,
	getDelegation,
	clearAll
} from './delegation-store.js';

const ENC_KEY = 'test-encryption-key-for-store';
const USER_ID = '0xabc123';
const DELEGATION_ID = 'del-001';
const VALID_KEY_SHARE = JSON.stringify({
	pubkey: { pubkey: { 0: 1, 1: 2, 2: 3 } },
	secretShare: 'secret-share'
});

beforeEach(() => {
	clearAll();
});

describe('delegation-store', () => {
	it('stores and retrieves a delegation', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);

		const delegation = getDelegation(DELEGATION_ID);
		expect(delegation).toBeDefined();
		expect(delegation!.userId).toBe(USER_ID);
		expect(delegation!.walletId).toBe('wallet-1');
		expect(delegation!.status).toBe('active');
	});

	it('activates and retrieves active delegation', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);

		expect(activateDelegation(USER_ID, DELEGATION_ID)).toBe(true);
		expect(isDelegationActive(USER_ID)).toBe(true);

		const active = getActiveDelegation(USER_ID);
		expect(active).toBeDefined();
		expect(active!.id).toBe(DELEGATION_ID);
	});

	it('decrypts credentials correctly', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'my-api-key', VALID_KEY_SHARE, ENC_KEY, 8453, 60_000
		);

		const creds = getDecryptedCredentials(DELEGATION_ID, ENC_KEY);
		expect(creds).toBeDefined();
		expect(creds!.walletId).toBe('wallet-1');
		expect(creds!.walletApiKey).toBe('my-api-key');
		expect(creds!.keyShare).toBe(VALID_KEY_SHARE);
		expect(creds!.chainId).toBe(8453);
	});

	it('reports credential health when credentials are usable', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'my-api-key', VALID_KEY_SHARE, ENC_KEY, 8453, 60_000
		);
		activateDelegation(USER_ID, DELEGATION_ID);

		expect(getCredentialHealth(DELEGATION_ID, ENC_KEY)).toEqual({ hasCredentials: true });
	});

	it('flags sync required when key share payload is malformed', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'my-api-key', 'not-json', ENC_KEY, 8453, 60_000
		);
		activateDelegation(USER_ID, DELEGATION_ID);

		const health = getCredentialHealth(DELEGATION_ID, ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('invalid_key_share_json');
		expect(getDecryptedCredentials(DELEGATION_ID, ENC_KEY)).toBeUndefined();
	});

	it('revokes a delegation', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);
		activateDelegation(USER_ID, DELEGATION_ID);

		expect(revokeDelegation(DELEGATION_ID)).toBe(true);
		expect(isDelegationActive(USER_ID)).toBe(false);
		expect(getDelegation(DELEGATION_ID)!.status).toBe('revoked');
	});

	it('revokes by wallet id', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);
		activateDelegation(USER_ID, DELEGATION_ID);

		expect(revokeByWalletId('wallet-1')).toBe(true);
		expect(isDelegationActive(USER_ID)).toBe(false);
		expect(getDelegation(DELEGATION_ID)!.status).toBe('revoked');
	});

	it('returns undefined for expired delegation', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, -1 // already expired
		);
		activateDelegation(USER_ID, DELEGATION_ID);

		expect(getActiveDelegation(USER_ID)).toBeUndefined();
		expect(isDelegationActive(USER_ID)).toBe(false);
	});

	it('rejects activation for wrong user', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);

		expect(activateDelegation('0xother-user', DELEGATION_ID)).toBe(false);
	});

	it('rejects activation of revoked delegation', () => {
		storeDelegation(
			DELEGATION_ID, USER_ID, 'wallet-1', '0xwallet',
			'api-key', 'key-share', ENC_KEY, 8453, 60_000
		);
		revokeDelegation(DELEGATION_ID);

		expect(activateDelegation(USER_ID, DELEGATION_ID)).toBe(false);
	});
});
