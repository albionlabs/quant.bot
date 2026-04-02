import { describe, it, expect } from 'vitest';
import { TokenUsageAccumulator, estimateTokens } from './token-usage.js';

describe('estimateTokens', () => {
	it('returns 0 for empty string', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('estimates roughly 1 token per 4 chars', () => {
		expect(estimateTokens('abcdefgh')).toBe(2);
	});

	it('rounds up', () => {
		expect(estimateTokens('abc')).toBe(1);
	});
});

describe('TokenUsageAccumulator', () => {
	it('starts with zero counts', () => {
		const acc = new TokenUsageAccumulator();
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(0);
		expect(summary.providerOutputTokens).toBe(0);
		expect(summary.providerTotalTokens).toBe(0);
		expect(summary.usageEvents).toBe(0);
		expect(summary.modelCalls).toBe(0);
	});

	it('counts model calls from model stream', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {});
		acc.addEvent('model', {});
		const summary = acc.summarize();
		expect(summary.modelCalls).toBe(2);
		expect(summary.streamCounts).toEqual({ model: 2 });
	});

	it('extracts tool names from toolName field', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('tool', { toolName: 'search' });
		acc.addEvent('tool', { toolName: 'search' });
		acc.addEvent('tool', { name: 'calculate' });
		const summary = acc.summarize();
		expect(summary.toolCalls).toEqual({ search: 2, calculate: 1 });
	});

	it('extracts tool names from nested tool.name', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('tool', { tool: { name: 'nested_tool' } });
		const summary = acc.summarize();
		expect(summary.toolCalls).toEqual({ nested_tool: 1 });
	});

	it('collects usage from inputTokens and outputTokens keys', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: { inputTokens: 100, outputTokens: 50 }
		});
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(100);
		expect(summary.providerOutputTokens).toBe(50);
		expect(summary.providerTotalTokens).toBe(150);
		expect(summary.usageEvents).toBe(1);
	});

	it('collects usage from promptTokens and completionTokens keys', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 }
		});
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(200);
		expect(summary.providerOutputTokens).toBe(80);
		expect(summary.providerTotalTokens).toBe(280);
	});

	it('accumulates across multiple events', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', { usage: { inputTokens: 100, outputTokens: 50 } });
		acc.addEvent('model', { usage: { inputTokens: 200, outputTokens: 100 } });
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(300);
		expect(summary.providerOutputTokens).toBe(150);
		expect(summary.usageEvents).toBe(2);
	});

	it('handles string token values', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: { inputTokens: '100', outputTokens: '50' }
		});
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(100);
		expect(summary.providerOutputTokens).toBe(50);
	});

	it('ignores non-numeric token values', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: { inputTokens: 'abc', outputTokens: null }
		});
		const summary = acc.summarize();
		expect(summary.usageEvents).toBe(0);
	});

	it('ignores negative token values', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: { inputTokens: -5, outputTokens: 10 }
		});
		const summary = acc.summarize();
		// -5 is not >= 0 so rejected; only outputTokens matches
		expect(summary.providerOutputTokens).toBe(10);
	});

	it('handles cache token keys', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', {
			usage: {
				cacheCreationInputTokens: 500,
				cacheReadInputTokens: 200,
				outputTokens: 50
			}
		});
		const summary = acc.summarize();
		expect(summary.providerInputTokens).toBe(700);
		expect(summary.providerOutputTokens).toBe(50);
	});

	it('sorts tool calls and stream counts by frequency descending', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('tool', { toolName: 'a' });
		acc.addEvent('tool', { toolName: 'b' });
		acc.addEvent('tool', { toolName: 'b' });
		acc.addEvent('model', {});
		acc.addEvent('model', {});
		acc.addEvent('model', {});
		acc.addEvent('model', {});
		const summary = acc.summarize();
		expect(Object.keys(summary.toolCalls)).toEqual(['b', 'a']);
		// model: 4, tool: 3 — model should sort first
		expect(Object.keys(summary.streamCounts)).toEqual(['model', 'tool']);
	});

	it('does not crash on null/undefined data', () => {
		const acc = new TokenUsageAccumulator();
		acc.addEvent('model', null);
		acc.addEvent('model', undefined);
		const summary = acc.summarize();
		expect(summary.modelCalls).toBe(2);
	});
});
