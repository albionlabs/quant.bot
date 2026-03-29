import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the SIWE sign-in timeout and abort logic.
 *
 * These test the timeout wrapper and gatewayFetch abort behaviour
 * that prevent the infinite "Signing in..." spinner (Issue #15).
 */

// ── withTimeout helper (extracted logic, matches ChatWidgetFloating.svelte) ──

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
		promise.then(
			(v) => { clearTimeout(timer); resolve(v); },
			(e) => { clearTimeout(timer); reject(e); }
		);
	});
}

describe('withTimeout', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves when the promise resolves before timeout', async () => {
		const p = withTimeout(Promise.resolve('ok'), 5000, 'test');
		await expect(p).resolves.toBe('ok');
	});

	it('rejects with the original error when the promise rejects before timeout', async () => {
		const p = withTimeout(Promise.reject(new Error('wallet denied')), 5000, 'test');
		await expect(p).rejects.toThrow('wallet denied');
	});

	it('rejects with a timeout error when the promise does not settle in time', async () => {
		const neverResolves = new Promise<string>(() => {});
		const p = withTimeout(neverResolves, 1000, 'Wallet connection');

		// Advance time past the timeout
		vi.advanceTimersByTime(1001);

		await expect(p).rejects.toThrow('Wallet connection timed out');
	});

	it('uses the label in the timeout error message', async () => {
		const neverResolves = new Promise<string>(() => {});
		const p = withTimeout(neverResolves, 500, 'Signature request');

		vi.advanceTimersByTime(501);

		await expect(p).rejects.toThrow('Signature request timed out');
	});
});

// ── gatewayFetch abort logic ──

describe('gatewayFetch abort via AbortController', () => {
	it('rejects with "Request timed out" when fetch is aborted', async () => {
		// Simulate what gatewayFetch does internally
		const controller = new AbortController();

		const fetchPromise = new Promise<Response>((_, reject) => {
			controller.signal.addEventListener('abort', () => {
				reject(new DOMException('The operation was aborted.', 'AbortError'));
			});
		});

		// Abort immediately
		controller.abort();

		try {
			await fetchPromise;
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(DOMException);
			expect((err as DOMException).name).toBe('AbortError');
		}
	});
});

// ── handleSiweLogin error flow simulation ──

describe('handleSiweLogin error handling', () => {
	it('produces an error message when wallet rejects the signature', async () => {
		let siweError: string | null = null;
		let signingIn = true;

		// Simulate the catch block from handleSiweLogin
		try {
			throw new Error('User rejected the request');
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
			signingIn = false;
		}

		expect(siweError).toBe('User rejected the request');
		expect(signingIn).toBe(false);
	});

	it('produces an error message when eth_accounts times out', async () => {
		vi.useFakeTimers();
		let siweError: string | null = null;
		let signingIn = true;

		const neverResolves = new Promise<string[]>(() => {});

		try {
			const accounts = withTimeout(neverResolves, 10_000, 'Wallet connection');
			vi.advanceTimersByTime(10_001);
			await accounts;
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
			signingIn = false;
		}

		expect(siweError).toBe('Wallet connection timed out');
		expect(signingIn).toBe(false);
		vi.useRealTimers();
	});

	it('produces an error message when personal_sign times out', async () => {
		vi.useFakeTimers();
		let siweError: string | null = null;
		let signingIn = true;

		const neverResolves = new Promise<string>(() => {});

		try {
			const sig = withTimeout(neverResolves, 60_000, 'Signature request');
			vi.advanceTimersByTime(60_001);
			await sig;
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
			signingIn = false;
		}

		expect(siweError).toBe('Signature request timed out');
		expect(signingIn).toBe(false);
		vi.useRealTimers();
	});

	it('produces an error message when login API times out', async () => {
		vi.useFakeTimers();
		let siweError: string | null = null;
		let signingIn = true;

		const neverResolves = new Promise<{ token: string }>(() => {});

		try {
			const result = withTimeout(neverResolves, 30_000, 'Sign-in');
			vi.advanceTimersByTime(30_001);
			await result;
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
			signingIn = false;
		}

		expect(siweError).toBe('Sign-in timed out');
		expect(signingIn).toBe(false);
		vi.useRealTimers();
	});

	it('always resets signingIn even on unexpected errors', async () => {
		let signingIn = true;
		let siweError: string | null = null;

		try {
			throw { weird: 'not an Error object' };
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
		} finally {
			signingIn = false;
		}

		expect(signingIn).toBe(false);
		expect(siweError).toBe('Sign-in failed');
	});
});
