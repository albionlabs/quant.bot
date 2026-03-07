import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllTokens, lookupToken, clearTokenRegistryCache } from './token-registry.js';

const MOCK_TOKEN_LIST = {
	name: 'Albion Base Token List',
	tokens: [
		{
			address: '0xf836a500910453A397084ADe41321ee20a5AAde1',
			symbol: 'ALB-WR1-R1',
			name: 'Albion WR1 Round 1',
			decimals: 18,
			logoURI: 'https://example.com/logo.png'
		},
		{
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	]
};

beforeEach(() => {
	clearTokenRegistryCache();
	vi.restoreAllMocks();
});

describe('getAllTokens', () => {
	it('fetches and returns the token list', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TOKEN_LIST), { status: 200 })
		);

		const result = await getAllTokens();
		expect(result.name).toBe('Albion Base Token List');
		expect(result.tokens).toHaveLength(2);
		expect(result.tokens[0].symbol).toBe('ALB-WR1-R1');
	});

	it('caches results for subsequent calls', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(MOCK_TOKEN_LIST), { status: 200 })
		);

		await getAllTokens();
		await getAllTokens();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('throws on fetch failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response('Not Found', { status: 404 })
		);

		await expect(getAllTokens()).rejects.toThrow('Failed to fetch token registry: 404');
	});
});

describe('lookupToken', () => {
	it('finds a token by symbol (case-insensitive)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TOKEN_LIST), { status: 200 })
		);

		const token = await lookupToken('alb-wr1-r1');
		expect(token).not.toBeNull();
		expect(token!.address).toBe('0xf836a500910453A397084ADe41321ee20a5AAde1');
	});

	it('finds a token by address (case-insensitive)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TOKEN_LIST), { status: 200 })
		);

		const token = await lookupToken('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
		expect(token).not.toBeNull();
		expect(token!.symbol).toBe('USDC');
	});

	it('returns null for unknown token', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TOKEN_LIST), { status: 200 })
		);

		const token = await lookupToken('UNKNOWN');
		expect(token).toBeNull();
	});
});
