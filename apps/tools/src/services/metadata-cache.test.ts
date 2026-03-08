import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { buildSchema, extractFields, getCached, setCached, clearCache } from './metadata-cache.js';

beforeEach(() => {
	clearCache();
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('buildSchema', () => {
	it('returns primitive type names', () => {
		expect(buildSchema('hello')).toBe('string');
		expect(buildSchema(42)).toBe('number');
		expect(buildSchema(true)).toBe('boolean');
		expect(buildSchema(null)).toBe('null');
		expect(buildSchema(undefined)).toBe('null');
	});

	it('describes objects recursively', () => {
		expect(buildSchema({ name: 'Alice', age: 30 })).toEqual({
			name: 'string',
			age: 'number'
		});
	});

	it('describes arrays with length and item shape', () => {
		const result = buildSchema([{ month: 'Jan', value: 100 }, { month: 'Feb', value: 200 }]);
		expect(result).toEqual({
			_type: 'array',
			_length: 2,
			_itemShape: { month: 'string', value: 'number' }
		});
	});

	it('describes empty arrays without item shape', () => {
		expect(buildSchema([])).toEqual({
			_type: 'array',
			_length: 0
		});
	});

	it('handles nested structures', () => {
		const data = {
			contractAddress: '0x123',
			asset: {
				status: 'active',
				production: [{ month: 'Jan', output: 500 }]
			}
		};
		expect(buildSchema(data)).toEqual({
			contractAddress: 'string',
			asset: {
				status: 'string',
				production: {
					_type: 'array',
					_length: 1,
					_itemShape: { month: 'string', output: 'number' }
				}
			}
		});
	});
});

describe('extractFields', () => {
	const data = {
		contractAddress: '0x123',
		symbol: 'TKN',
		asset: {
			location: { state: 'TX', country: 'US' },
			status: 'active'
		},
		payoutData: [1, 2, 3]
	};

	it('extracts top-level fields', () => {
		expect(extractFields(data, ['symbol'])).toEqual({ symbol: 'TKN' });
	});

	it('extracts nested dot-path fields', () => {
		expect(extractFields(data, ['asset.location'])).toEqual({
			'asset.location': { state: 'TX', country: 'US' }
		});
	});

	it('extracts multiple fields at once', () => {
		const result = extractFields(data, ['asset.location', 'payoutData']);
		expect(result).toEqual({
			'asset.location': { state: 'TX', country: 'US' },
			payoutData: [1, 2, 3]
		});
	});

	it('returns null for missing paths', () => {
		expect(extractFields(data, ['nonexistent'])).toEqual({ nonexistent: null });
		expect(extractFields(data, ['asset.missing.deep'])).toEqual({ 'asset.missing.deep': null });
	});
});

describe('cache TTL', () => {
	it('stores and retrieves cached data', () => {
		const data = { name: 'test' };
		setCached('0xABC', data);
		expect(getCached('0xABC')).toEqual(data);
	});

	it('normalizes addresses to lowercase', () => {
		setCached('0xABC', { name: 'test' });
		expect(getCached('0xabc')).toEqual({ name: 'test' });
	});

	it('returns null for missing entries', () => {
		expect(getCached('0xDEF')).toBeNull();
	});

	it('expires entries after TTL', () => {
		vi.useFakeTimers();
		setCached('0xABC', { name: 'test' });
		expect(getCached('0xABC')).not.toBeNull();

		vi.advanceTimersByTime(10 * 60 * 1000 + 1);
		expect(getCached('0xABC')).toBeNull();
	});
});
