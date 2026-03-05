import Database from 'better-sqlite3';
import type { DelegationStatus } from '@quant-bot/shared-types';
import { encrypt, decrypt } from './delegation-crypto.js';

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
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

interface DelegationRow {
	id: string;
	user_id: string;
	wallet_id: string;
	wallet_address: string;
	encrypted_credentials: string;
	iv: string;
	auth_tag: string;
	status: string;
	chain_id: number;
	created_at: number;
	expires_at: number;
}

function rowToDelegation(row: DelegationRow): StoredDelegation {
	return {
		id: row.id,
		userId: row.user_id,
		walletId: row.wallet_id,
		walletAddress: row.wallet_address,
		encryptedCredentials: row.encrypted_credentials,
		iv: row.iv,
		authTag: row.auth_tag,
		status: row.status as DelegationStatus,
		chainId: row.chain_id,
		createdAt: row.created_at,
		expiresAt: row.expires_at
	};
}

let db: Database.Database;

function initDb(dbPath?: string): Database.Database {
	const instance = new Database(dbPath ?? process.env.DELEGATION_DB_PATH ?? ':memory:');
	instance.pragma('journal_mode = WAL');
	instance.pragma('foreign_keys = ON');
	instance.exec(`
		CREATE TABLE IF NOT EXISTS delegations (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			wallet_id TEXT NOT NULL,
			wallet_address TEXT NOT NULL,
			encrypted_credentials TEXT NOT NULL,
			iv TEXT NOT NULL,
			auth_tag TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			chain_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		)
	`);
	instance.exec(`CREATE INDEX IF NOT EXISTS idx_delegations_user_id ON delegations (user_id)`);
	instance.exec(`CREATE INDEX IF NOT EXISTS idx_delegations_wallet_id ON delegations (wallet_id)`);
	return instance;
}

db = initDb();

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

	db.prepare(`
		INSERT INTO delegations (id, user_id, wallet_id, wallet_address, encrypted_credentials, iv, auth_tag, status, chain_id, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
	`).run(id, userId, walletId, walletAddress, ciphertext, iv, authTag, chainId, Date.now(), Date.now() + ttlMs);
}

export function getActiveDelegation(userId: string): StoredDelegation | undefined {
	const now = Date.now();

	// Expire any delegations that are past their expiry
	db.prepare(`UPDATE delegations SET status = 'expired' WHERE user_id = ? AND status = 'active' AND expires_at <= ?`)
		.run(userId, now);

	const row = db.prepare(`SELECT * FROM delegations WHERE user_id = ? AND status = 'active' AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
		.get(userId, now) as DelegationRow | undefined;

	return row ? rowToDelegation(row) : undefined;
}

export function getDecryptedCredentials(delegationId: string, encryptionKey: string): DecryptedCredentials | undefined {
	const now = Date.now();
	const row = db.prepare(`SELECT * FROM delegations WHERE id = ? AND status = 'active' AND expires_at > ?`)
		.get(delegationId, now) as DelegationRow | undefined;

	if (!row) return undefined;

	const decrypted = decrypt(row.encrypted_credentials, row.iv, row.auth_tag, encryptionKey);
	const { walletApiKey, keyShare } = JSON.parse(decrypted);

	return {
		walletId: row.wallet_id,
		walletApiKey,
		keyShare,
		chainId: row.chain_id
	};
}

export function activateDelegation(userId: string, delegationId: string): boolean {
	const now = Date.now();
	const row = db.prepare(`SELECT * FROM delegations WHERE id = ? AND status = 'active' AND expires_at > ?`)
		.get(delegationId, now) as DelegationRow | undefined;

	if (!row) return false;
	if (row.user_id !== userId) return false;

	// Revoke any other active delegation for this user
	db.prepare(`UPDATE delegations SET status = 'revoked' WHERE user_id = ? AND status = 'active' AND id != ?`)
		.run(userId, delegationId);

	return true;
}

export function revokeDelegation(delegationId: string): boolean {
	const result = db.prepare(`UPDATE delegations SET status = 'revoked' WHERE id = ? AND status != 'revoked'`)
		.run(delegationId);
	return result.changes > 0;
}

export function isDelegationActive(userId: string): boolean {
	return getActiveDelegation(userId) !== undefined;
}

export function getDelegation(delegationId: string): StoredDelegation | undefined {
	const row = db.prepare(`SELECT * FROM delegations WHERE id = ?`)
		.get(delegationId) as DelegationRow | undefined;
	return row ? rowToDelegation(row) : undefined;
}

export function revokeByWalletId(walletId: string): boolean {
	const result = db.prepare(`UPDATE delegations SET status = 'revoked' WHERE wallet_id = ? AND status = 'active'`)
		.run(walletId);
	return result.changes > 0;
}

export function clearAll(): void {
	db.exec('DELETE FROM delegations');
}

export function closeDb(): void {
	db.close();
}

/** Re-initialize DB with a specific path (used for persistence tests). */
export function _resetDb(dbPath?: string): void {
	db.close();
	db = initDb(dbPath);
}
