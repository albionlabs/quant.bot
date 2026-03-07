import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StagedTransaction, TransactionSimulation } from '@quant-bot/shared-types';

let createBundle: typeof import('./signing-store.js').createBundle;
let getBundle: typeof import('./signing-store.js').getBundle;
let isBundleCompleted: typeof import('./signing-store.js').isBundleCompleted;
let markCompleted: typeof import('./signing-store.js').markCompleted;

const mockTx: StagedTransaction & { simulation: TransactionSimulation } = {
	label: 'Approve USDC',
	to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
	data: '0x095ea7b3',
	simulation: {
		index: 0,
		label: 'Approve USDC',
		success: true,
		gasUsed: '52000'
	}
};

describe('signing store', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		const mod = await import('./signing-store.js');
		createBundle = mod.createBundle;
		getBundle = mod.getBundle;
		isBundleCompleted = mod.isBundleCompleted;
		markCompleted = mod.markCompleted;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates and retrieves a bundle', () => {
		const id = createBundle('0xuser', 8453, [mockTx]);
		const bundle = getBundle(id);

		expect(bundle).not.toBeNull();
		expect(bundle!.signingId).toBe(id);
		expect(bundle!.chainId).toBe(8453);
		expect(bundle!.from).toBe('0xuser');
		expect(bundle!.transactions).toHaveLength(1);
		expect(bundle!.transactions[0].label).toBe('Approve USDC');
	});

	it('returns null for unknown signing ID', () => {
		expect(getBundle('nonexistent')).toBeNull();
	});

	it('returns null for expired bundles', () => {
		const id = createBundle('0xuser', 8453, [mockTx]);
		expect(getBundle(id)).not.toBeNull();

		// Advance past 10 minute TTL
		vi.advanceTimersByTime(11 * 60 * 1000);
		expect(getBundle(id)).toBeNull();
	});

	it('marks bundle as completed', () => {
		const id = createBundle('0xuser', 8453, [mockTx]);
		expect(isBundleCompleted(id)).toBe(false);

		const result = markCompleted(id, ['0xhash1']);
		expect(result).toBe(true);
		expect(isBundleCompleted(id)).toBe(true);
	});

	it('returns false when marking unknown bundle as completed', () => {
		expect(markCompleted('nonexistent', ['0xhash'])).toBe(false);
	});

	it('stores metadata', () => {
		const id = createBundle('0xuser', 8453, [mockTx], {
			operationType: 'strategy_deployment',
			strategyKey: 'fixed-limit'
		});
		const bundle = getBundle(id);
		expect(bundle!.metadata).toEqual({
			operationType: 'strategy_deployment',
			strategyKey: 'fixed-limit'
		});
	});
});
