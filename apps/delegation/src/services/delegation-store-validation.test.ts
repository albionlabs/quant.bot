import { describe, it, expect, beforeEach } from 'vitest';
import {
	storeDelegation,
	getDecryptedCredentials,
	getCredentialHealth,
	activateDelegation,
	revokeDelegation,
	revokeByWalletId,
	getDelegation,
	clearAll
} from './delegation-store.js';

const ENC_KEY = 'test-encryption-key-for-store';
const USER_ID = '0xabc123';

let nextId = 0;
function storeWithKeyShare(keyShare: string): string {
	const id = `del-ks-${++nextId}`;
	storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', 'api-key', keyShare, ENC_KEY, 8453, 60_000);
	activateDelegation(USER_ID, id);
	return id;
}

beforeEach(() => {
	clearAll();
	nextId = 0;
});

describe('validateKeyShareShape — all branches', () => {
	it.each([
		['invalid JSON', 'not-json', 'invalid_key_share_json'],
		['non-object (array)', JSON.stringify([1, 2, 3]), 'invalid_key_share_shape'],
		['non-object (string)', JSON.stringify('just-a-string'), 'invalid_key_share_shape'],
		['missing secretShare', JSON.stringify({ pubkey: { pubkey: { 0: 1 } } }), 'missing_secret_share'],
		['empty secretShare', JSON.stringify({ secretShare: '', pubkey: { pubkey: { 0: 1 } } }), 'missing_secret_share'],
		['missing pubkey', JSON.stringify({ secretShare: 'abc' }), 'missing_pubkey'],
		['pubkey is non-object', JSON.stringify({ secretShare: 'abc', pubkey: 'not-obj' }), 'missing_pubkey'],
		['missing pubkey.pubkey', JSON.stringify({ secretShare: 'abc', pubkey: {} }), 'missing_pubkey_bytes'],
		['empty Uint8Array-like pubkey bytes', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: [] } }), 'empty_pubkey_bytes'],
		['empty object pubkey bytes', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: {} } }), 'empty_pubkey_bytes'],
		['pubkey.pubkey is primitive (number)', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: 42 } }), 'invalid_pubkey_bytes_shape'],
		['pubkey.pubkey is primitive (boolean)', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: true } }), 'invalid_pubkey_bytes_shape'],
	])('rejects key share with %s → %s', (_desc, keyShare, expectedReason) => {
		const id = storeWithKeyShare(keyShare);
		const health = getCredentialHealth(id, ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe(expectedReason);
		expect(getDecryptedCredentials(id, ENC_KEY)).toBeUndefined();
	});

	it.each([
		['object-style pubkey bytes', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: { 0: 1, 1: 2 } } })],
		['array-style pubkey bytes', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: [1, 2, 3] } })],
	])('accepts valid key share with %s', (_desc, keyShare) => {
		const id = storeWithKeyShare(keyShare);
		const health = getCredentialHealth(id, ENC_KEY);
		expect(health.hasCredentials).toBe(true);
		expect(getDecryptedCredentials(id, ENC_KEY)).toBeDefined();
	});
});

describe('parseCredentialBlob — error branches', () => {
	it('returns decrypt_failed when encryption key is wrong', () => {
		const id = 'del-decrypt-fail';
		storeDelegation(
			id, USER_ID, 'wallet-1', '0xwallet',
			'api-key', JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: { 0: 1 } } }),
			ENC_KEY, 8453, 60_000
		);
		activateDelegation(USER_ID, id);

		const health = getCredentialHealth(id, 'wrong-encryption-key');
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('decrypt_failed');
	});

	it('returns missing_wallet_api_key when walletApiKey is empty', () => {
		const id = 'del-no-api-key';
		const validKeyShare = JSON.stringify({ secretShare: 'abc', pubkey: { pubkey: { 0: 1 } } });
		storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', '', validKeyShare, ENC_KEY, 8453, 60_000);
		activateDelegation(USER_ID, id);

		const health = getCredentialHealth(id, ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('missing_wallet_api_key');
	});

	it('returns missing_key_share when keyShare is empty', () => {
		const id = 'del-no-share';
		storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', 'api-key', '', ENC_KEY, 8453, 60_000);
		activateDelegation(USER_ID, id);

		const health = getCredentialHealth(id, ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('missing_key_share');
	});

	it('returns delegation_not_found for non-existent delegation', () => {
		const health = getCredentialHealth('non-existent', ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('delegation_not_found');
	});

	it('returns delegation_inactive for revoked delegation', () => {
		const id = 'del-revoked';
		storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', 'api-key', 'share', ENC_KEY, 8453, 60_000);
		revokeDelegation(id);

		const health = getCredentialHealth(id, ENC_KEY);
		expect(health.hasCredentials).toBe(false);
		expect(health.reason).toBe('delegation_inactive');
	});
});

describe('revokeByWalletId — grace period', () => {
	it('skips recently created delegation when grace period is set', () => {
		const id = 'del-grace';
		storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', 'api-key', 'share', ENC_KEY, 8453, 60_000);
		activateDelegation(USER_ID, id);

		// Grace period of 60s — delegation was just created so createdAt > cutoff
		const revoked = revokeByWalletId('wallet-1', 60_000);
		expect(revoked).toBe(false);
		expect(getDelegation(id)!.status).toBe('active');
	});

	it('revokes delegation older than grace period', () => {
		const id = 'del-old';
		storeDelegation(id, USER_ID, 'wallet-1', '0xwallet', 'api-key', 'share', ENC_KEY, 8453, 60_000);
		activateDelegation(USER_ID, id);

		// Grace period of 0ms — all active delegations should be revoked
		const revoked = revokeByWalletId('wallet-1', 0);
		expect(revoked).toBe(true);
		expect(getDelegation(id)!.status).toBe('revoked');
	});
});
