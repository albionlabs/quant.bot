import { describe, it, expect } from 'vitest';
import { getChain } from './client.js';

describe('getChain', () => {
	it('returns base chain', () => {
		const chain = getChain('base');
		expect(chain.id).toBe(8453);
		expect(chain.name).toBe('Base');
	});

	it('returns base-sepolia chain', () => {
		const chain = getChain('base-sepolia');
		expect(chain.id).toBe(84532);
	});

	it('throws for unknown chain', () => {
		expect(() => getChain('ethereum')).toThrow('Unknown chain: ethereum');
	});

	it('throws for empty string', () => {
		expect(() => getChain('')).toThrow('Unknown chain: ');
	});
});
