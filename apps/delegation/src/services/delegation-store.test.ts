import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	storeDelegation,
	getActiveDelegation,
	getDecryptedCredentials,
	activateDelegation,
	revokeDelegation,
	revokeByWalletId,
	isDelegationActive,
	getDelegation,
	clearAll,
	closeDb,
	_resetDb
} from './delegation-store.js';

const ENC_KEY = 'test-encryption-key-for-store';
const USER_ID = '0xabc123';
const DELEGATION_ID = 'del-001';

beforeEach(() => {
	clearAll();
});

afterAll(() => {
	closeDb();
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
			'my-api-key', 'my-key-share', ENC_KEY, 8453, 60_000
		);

		const creds = getDecryptedCredentials(DELEGATION_ID, ENC_KEY);
		expect(creds).toBeDefined();
		expect(creds!.walletId).toBe('wallet-1');
		expect(creds!.walletApiKey).toBe('my-api-key');
		expect(creds!.keyShare).toBe('my-key-share');
		expect(creds!.chainId).toBe(8453);
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

	it('persists data across DB close/reopen with file-backed DB', () => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'delegation-test-'));
		const dbPath = join(tmpDir, 'test.db');

		try {
			// Open a file-backed DB and write data
			_resetDb(dbPath);
			storeDelegation(
				'persist-1', USER_ID, 'wallet-1', '0xwallet',
				'api-key', 'key-share', ENC_KEY, 8453, 60_000
			);
			expect(getDelegation('persist-1')).toBeDefined();

			// Close and reopen — data should survive
			_resetDb(dbPath);
			const delegation = getDelegation('persist-1');
			expect(delegation).toBeDefined();
			expect(delegation!.userId).toBe(USER_ID);
			expect(delegation!.walletId).toBe('wallet-1');
			expect(delegation!.status).toBe('active');

			// Reset back to in-memory for remaining tests
			_resetDb();
		} finally {
			if (existsSync(tmpDir)) {
				rmSync(tmpDir, { recursive: true });
			}
		}
	});
});
