export interface TokenUsageSummary {
	providerInputTokens: number;
	providerOutputTokens: number;
	providerTotalTokens: number;
	usageEvents: number;
	modelCalls: number;
	toolCalls: Record<string, number>;
	streamCounts: Record<string, number>;
}

const INPUT_KEYS = new Set([
	'inputtokens',
	'inputtoken',
	'prompttokens',
	'prompttoken',
	'cachecreationinputtokens',
	'cachereadinputtokens'
]);

const OUTPUT_KEYS = new Set(['outputtokens', 'outputtoken', 'completiontokens', 'completiontoken']);

const TOTAL_KEYS = new Set(['totaltokens', 'totaltoken']);

function normalizeKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z]/g, '');
}

function parseTokenNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		return Math.floor(value);
	}
	if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
		const parsed = Number(value);
		if (Number.isFinite(parsed) && parsed >= 0) {
			return Math.floor(parsed);
		}
	}
	return null;
}

function extractUsageFromObject(
	value: Record<string, unknown>
): { input: number; output: number; total: number } | null {
	let input = 0;
	let output = 0;
	let total = 0;
	let matched = false;

	for (const [key, raw] of Object.entries(value)) {
		const parsed = parseTokenNumber(raw);
		if (parsed === null) continue;
		const normalized = normalizeKey(key);
		if (INPUT_KEYS.has(normalized)) {
			input += parsed;
			matched = true;
			continue;
		}
		if (OUTPUT_KEYS.has(normalized)) {
			output += parsed;
			matched = true;
			continue;
		}
		if (TOTAL_KEYS.has(normalized)) {
			total += parsed;
			matched = true;
		}
	}

	if (!matched) return null;
	if (total === 0 && (input > 0 || output > 0)) {
		total = input + output;
	}
	return { input, output, total };
}

function sortedCounts(map: Map<string, number>): Record<string, number> {
	return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

export class TokenUsageAccumulator {
	private providerInputTokens = 0;
	private providerOutputTokens = 0;
	private providerTotalTokens = 0;
	private usageEvents = 0;
	private modelCalls = 0;
	private readonly toolCalls = new Map<string, number>();
	private readonly streamCounts = new Map<string, number>();

	addEvent(stream: string, data: unknown): void {
		this.streamCounts.set(stream, (this.streamCounts.get(stream) ?? 0) + 1);

		if (stream === 'model') {
			this.modelCalls += 1;
		}

		const toolName = this.extractToolName(data);
		if (toolName) {
			this.toolCalls.set(toolName, (this.toolCalls.get(toolName) ?? 0) + 1);
		}

		this.collectUsage(data);
	}

	summarize(): TokenUsageSummary {
		if (
			this.providerTotalTokens === 0 &&
			(this.providerInputTokens > 0 || this.providerOutputTokens > 0)
		) {
			this.providerTotalTokens = this.providerInputTokens + this.providerOutputTokens;
		}

		return {
			providerInputTokens: this.providerInputTokens,
			providerOutputTokens: this.providerOutputTokens,
			providerTotalTokens: this.providerTotalTokens,
			usageEvents: this.usageEvents,
			modelCalls: this.modelCalls,
			toolCalls: sortedCounts(this.toolCalls),
			streamCounts: sortedCounts(this.streamCounts)
		};
	}

	private extractToolName(data: unknown): string | null {
		if (!data || typeof data !== 'object') return null;
		const record = data as Record<string, unknown>;
		const direct = record.toolName ?? record.name;
		if (typeof direct === 'string' && direct.trim() !== '') {
			return direct;
		}
		const nestedTool = record.tool;
		if (nestedTool && typeof nestedTool === 'object') {
			const nestedName = (nestedTool as Record<string, unknown>).name;
			if (typeof nestedName === 'string' && nestedName.trim() !== '') {
				return nestedName;
			}
		}
		return null;
	}

	private collectUsage(root: unknown): void {
		const stack: unknown[] = [root];
		const seen = new Set<object>();
		let visitedNodes = 0;
		const MAX_NODES = 2_000;

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || typeof current !== 'object') continue;
			if (seen.has(current)) continue;
			seen.add(current);

			visitedNodes += 1;
			if (visitedNodes > MAX_NODES) break;

			if (Array.isArray(current)) {
				for (const item of current) stack.push(item);
				continue;
			}

			const record = current as Record<string, unknown>;
			const usage = extractUsageFromObject(record);
			if (usage) {
				this.providerInputTokens += usage.input;
				this.providerOutputTokens += usage.output;
				this.providerTotalTokens += usage.total;
				this.usageEvents += 1;
			}

			for (const value of Object.values(record)) {
				if (value && typeof value === 'object') {
					stack.push(value);
				}
			}
		}
	}
}

export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}
