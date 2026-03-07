import type { RegistryToken } from '@quant-bot/shared-types';
import { TOKEN_REGISTRY_URL } from '../constants.js';

interface RawTokenList {
	name: string;
	tokens: Array<{
		address: string;
		symbol: string;
		name: string;
		decimals: number;
		logoURI?: string;
	}>;
}

interface CachedTokenList {
	name: string;
	tokens: RegistryToken[];
	fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cache: CachedTokenList | null = null;

async function fetchTokenList(): Promise<CachedTokenList> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache;
	}

	const response = await fetch(TOKEN_REGISTRY_URL, {
		signal: AbortSignal.timeout(10_000)
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch token registry: ${response.status}`);
	}

	const raw = (await response.json()) as RawTokenList;

	const tokens: RegistryToken[] = raw.tokens.map((t) => ({
		address: t.address,
		symbol: t.symbol,
		name: t.name,
		decimals: t.decimals,
		logoURI: t.logoURI
	}));

	cache = { name: raw.name, tokens, fetchedAt: Date.now() };
	return cache;
}

export async function getAllTokens(): Promise<{ name: string; tokens: RegistryToken[] }> {
	const list = await fetchTokenList();
	return { name: list.name, tokens: list.tokens };
}

export async function lookupToken(symbolOrAddress: string): Promise<RegistryToken | null> {
	const list = await fetchTokenList();
	const needle = symbolOrAddress.toLowerCase();

	return (
		list.tokens.find(
			(t) =>
				t.symbol.toLowerCase() === needle ||
				t.address.toLowerCase() === needle
		) ?? null
	);
}

/** Clear cache (for testing) */
export function clearTokenRegistryCache(): void {
	cache = null;
}
