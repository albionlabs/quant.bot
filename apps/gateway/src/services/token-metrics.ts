export interface RecordedTokenRun {
	ts: number;
	userId: string;
	sessionId: string;
	status: 'completed' | 'timeout' | 'error';
	promptChars: number;
	completionChars: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	providerInputTokens: number;
	providerOutputTokens: number;
	providerTotalTokens: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	modelCalls: number;
	usageEvents: number;
	toolCalls: Record<string, number>;
	streamCounts: Record<string, number>;
}

const DEFAULT_MAX_RUNS = 2_000;

let maxRuns = DEFAULT_MAX_RUNS;
const runs: RecordedTokenRun[] = [];

export function configureTokenMetrics(options?: { maxRuns?: number }): void {
	const nextMaxRuns = options?.maxRuns;
	if (!nextMaxRuns || !Number.isFinite(nextMaxRuns) || nextMaxRuns < 1) return;
	maxRuns = Math.floor(nextMaxRuns);
	if (runs.length > maxRuns) {
		runs.splice(0, runs.length - maxRuns);
	}
}

export function recordTokenRun(run: RecordedTokenRun): void {
	runs.push(run);
	if (runs.length > maxRuns) {
		runs.shift();
	}
}

function topTotalsByKey<K extends string>(
	items: RecordedTokenRun[],
	keySelector: (item: RecordedTokenRun) => K
): Array<{ key: K; totalTokens: number; runs: number }> {
	const stats = new Map<K, { totalTokens: number; runs: number }>();
	for (const item of items) {
		const key = keySelector(item);
		const existing = stats.get(key);
		if (existing) {
			existing.totalTokens += item.totalTokens;
			existing.runs += 1;
		} else {
			stats.set(key, { totalTokens: item.totalTokens, runs: 1 });
		}
	}
	return [...stats.entries()]
		.map(([key, value]) => ({ key, totalTokens: value.totalTokens, runs: value.runs }))
		.sort((a, b) => b.totalTokens - a.totalTokens);
}

function topToolTotals(items: RecordedTokenRun[]): Array<{ tool: string; hits: number }> {
	const stats = new Map<string, number>();
	for (const item of items) {
		for (const [tool, hits] of Object.entries(item.toolCalls)) {
			stats.set(tool, (stats.get(tool) ?? 0) + hits);
		}
	}
	return [...stats.entries()]
		.map(([tool, hits]) => ({ tool, hits }))
		.sort((a, b) => b.hits - a.hits);
}

export function getTokenMetricsSnapshot(limit = 100): {
	totalRuns: number;
	totalTokens: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalProviderInputTokens: number;
	totalProviderOutputTokens: number;
	totalProviderTokens: number;
	topUsers: Array<{ key: string; totalTokens: number; runs: number }>;
	topSessions: Array<{ key: string; totalTokens: number; runs: number }>;
	topTools: Array<{ tool: string; hits: number }>;
	recentRuns: RecordedTokenRun[];
} {
	const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
	const recentRuns = runs.slice(-safeLimit).reverse();
	const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0);
	const totalInputTokens = runs.reduce((sum, run) => sum + run.inputTokens, 0);
	const totalOutputTokens = runs.reduce((sum, run) => sum + run.outputTokens, 0);
	const totalProviderInputTokens = runs.reduce((sum, run) => sum + run.providerInputTokens, 0);
	const totalProviderOutputTokens = runs.reduce((sum, run) => sum + run.providerOutputTokens, 0);
	const totalProviderTokens = runs.reduce((sum, run) => sum + run.providerTotalTokens, 0);

	return {
		totalRuns: runs.length,
		totalTokens,
		totalInputTokens,
		totalOutputTokens,
		totalProviderInputTokens,
		totalProviderOutputTokens,
		totalProviderTokens,
		topUsers: topTotalsByKey(runs, (run) => run.userId).slice(0, 20),
		topSessions: topTotalsByKey(runs, (run) => run.sessionId).slice(0, 20),
		topTools: topToolTotals(runs).slice(0, 20),
		recentRuns
	};
}
