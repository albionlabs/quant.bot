import { randomUUID } from 'node:crypto';
import type {
	StagedTransaction,
	TransactionSimulation,
	SigningBundle
} from '@quant-bot/shared-types';

interface StoredBundle {
	userId: string;
	chainId: number;
	transactions: Array<StagedTransaction & { simulation: TransactionSimulation }>;
	metadata?: SigningBundle['metadata'];
	expiresAt: number;
	completed: boolean;
	txHashes?: string[];
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

const store = new Map<string, StoredBundle>();

const cleanupTimer = setInterval(() => {
	const now = Date.now();
	for (const [id, bundle] of store) {
		if (now > bundle.expiresAt) {
			store.delete(id);
		}
	}
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

export function createBundle(
	userId: string,
	chainId: number,
	transactions: Array<StagedTransaction & { simulation: TransactionSimulation }>,
	metadata?: SigningBundle['metadata']
): string {
	const signingId = randomUUID();
	store.set(signingId, {
		userId,
		chainId,
		transactions,
		metadata,
		expiresAt: Date.now() + TTL_MS,
		completed: false
	});
	return signingId;
}

export function getBundle(signingId: string): (SigningBundle & { userId: string }) | null {
	const entry = store.get(signingId);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		store.delete(signingId);
		return null;
	}
	return {
		signingId,
		userId: entry.userId,
		chainId: entry.chainId,
		from: entry.userId,
		transactions: entry.transactions,
		metadata: entry.metadata,
		expiresAt: entry.expiresAt
	};
}

export function isBundleCompleted(signingId: string): boolean {
	return store.get(signingId)?.completed ?? false;
}

export function markCompleted(signingId: string, txHashes: string[]): boolean {
	const entry = store.get(signingId);
	if (!entry) return false;
	entry.completed = true;
	entry.txHashes = txHashes;
	return true;
}

