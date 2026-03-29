import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let configureTokenMetrics: typeof import('./token-metrics.js').configureTokenMetrics;
let recordTokenRun: typeof import('./token-metrics.js').recordTokenRun;
let getTokenMetricsSnapshot: typeof import('./token-metrics.js').getTokenMetricsSnapshot;

function makeRun(overrides: Partial<import('./token-metrics.js').RecordedTokenRun> = {}): import('./token-metrics.js').RecordedTokenRun {
	return {
		ts: Date.now(),
		userId: 'user-1',
		sessionId: 'session-1',
		status: 'completed',
		promptChars: 100,
		completionChars: 200,
		inputTokens: 25,
		outputTokens: 50,
		totalTokens: 75,
		providerInputTokens: 30,
		providerOutputTokens: 60,
		providerTotalTokens: 90,
		estimatedInputTokens: 25,
		estimatedOutputTokens: 50,
		modelCalls: 1,
		usageEvents: 1,
		toolCalls: {},
		streamCounts: {},
		...overrides
	};
}

describe('token metrics', () => {
	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('./token-metrics.js');
		configureTokenMetrics = mod.configureTokenMetrics;
		recordTokenRun = mod.recordTokenRun;
		getTokenMetricsSnapshot = mod.getTokenMetricsSnapshot;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('starts with empty snapshot', () => {
		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.totalRuns).toBe(0);
		expect(snapshot.totalTokens).toBe(0);
		expect(snapshot.recentRuns).toEqual([]);
	});

	it('records and retrieves runs', () => {
		recordTokenRun(makeRun({ totalTokens: 100 }));
		recordTokenRun(makeRun({ totalTokens: 200 }));

		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.totalRuns).toBe(2);
		expect(snapshot.totalTokens).toBe(300);
	});

	it('returns recent runs in reverse order', () => {
		recordTokenRun(makeRun({ sessionId: 'first' }));
		recordTokenRun(makeRun({ sessionId: 'second' }));

		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.recentRuns[0].sessionId).toBe('second');
		expect(snapshot.recentRuns[1].sessionId).toBe('first');
	});

	it('limits recent runs', () => {
		for (let i = 0; i < 10; i++) {
			recordTokenRun(makeRun());
		}
		const snapshot = getTokenMetricsSnapshot(3);
		expect(snapshot.recentRuns).toHaveLength(3);
		expect(snapshot.totalRuns).toBe(10);
	});

	it('aggregates top users', () => {
		recordTokenRun(makeRun({ userId: 'alice', totalTokens: 100 }));
		recordTokenRun(makeRun({ userId: 'alice', totalTokens: 200 }));
		recordTokenRun(makeRun({ userId: 'bob', totalTokens: 50 }));

		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.topUsers[0]).toEqual({ key: 'alice', totalTokens: 300, runs: 2 });
		expect(snapshot.topUsers[1]).toEqual({ key: 'bob', totalTokens: 50, runs: 1 });
	});

	it('aggregates top tools', () => {
		recordTokenRun(makeRun({ toolCalls: { search: 3, calculate: 1 } }));
		recordTokenRun(makeRun({ toolCalls: { search: 2 } }));

		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.topTools[0]).toEqual({ tool: 'search', hits: 5 });
		expect(snapshot.topTools[1]).toEqual({ tool: 'calculate', hits: 1 });
	});

	it('configureTokenMetrics limits stored runs', () => {
		configureTokenMetrics({ maxRuns: 3 });
		for (let i = 0; i < 5; i++) {
			recordTokenRun(makeRun({ sessionId: `s${i}` }));
		}
		const snapshot = getTokenMetricsSnapshot();
		expect(snapshot.totalRuns).toBe(3);
	});

	it('configureTokenMetrics ignores invalid values', () => {
		configureTokenMetrics({ maxRuns: -1 });
		configureTokenMetrics({ maxRuns: 0 });
		configureTokenMetrics();
		// Should not throw and keep default maxRuns
		recordTokenRun(makeRun());
		expect(getTokenMetricsSnapshot().totalRuns).toBe(1);
	});

	it('clamps snapshot limit between 1 and 500', () => {
		for (let i = 0; i < 5; i++) {
			recordTokenRun(makeRun());
		}
		const snapshot = getTokenMetricsSnapshot(0);
		expect(snapshot.recentRuns).toHaveLength(1); // clamped to min 1
	});
});
