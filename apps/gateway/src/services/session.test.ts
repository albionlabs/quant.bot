import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let createSession: typeof import('./session.js').createSession;
let restoreSession: typeof import('./session.js').restoreSession;
let getSession: typeof import('./session.js').getSession;
let touchSession: typeof import('./session.js').touchSession;

describe('session service', () => {
	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('./session.js');
		createSession = mod.createSession;
		restoreSession = mod.restoreSession;
		getSession = mod.getSession;
		touchSession = mod.touchSession;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates a session with a unique id', () => {
		const session = createSession('user-1');
		expect(session.id).toBeDefined();
		expect(session.userId).toBe('user-1');
		expect(session.createdAt).toBeGreaterThan(0);
		expect(session.lastMessageAt).toBe(session.createdAt);
	});

	it('retrieves a created session', () => {
		const session = createSession('user-1');
		const found = getSession(session.id);
		expect(found).toEqual(session);
	});

	it('returns undefined for unknown session', () => {
		expect(getSession('nonexistent')).toBeUndefined();
	});

	it('restores a session with a given id', () => {
		const session = restoreSession('my-session-id', 'user-2');
		expect(session.id).toBe('my-session-id');
		expect(session.userId).toBe('user-2');
		expect(getSession('my-session-id')).toEqual(session);
	});

	it('touchSession updates lastMessageAt', () => {
		const session = createSession('user-1');
		const originalTime = session.lastMessageAt;

		// Small delay to ensure time difference
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		touchSession(session.id);
		vi.useRealTimers();

		const updated = getSession(session.id);
		expect(updated!.lastMessageAt).toBeGreaterThan(originalTime);
	});

	it('touchSession does nothing for unknown session', () => {
		// Should not throw
		touchSession('nonexistent');
	});

	it('creates unique ids for different sessions', () => {
		const s1 = createSession('user-1');
		const s2 = createSession('user-1');
		expect(s1.id).not.toBe(s2.id);
	});
});
