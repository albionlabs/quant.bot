import type {
	LoginResponse,
	NpvResponse,
	OrderbookResponse,
	SigningBundle,
	SigningCompleteResponse,
	TokenLookupResponse,
	TokenMetadataResponse,
	TradeHistoryResponse
} from '@quant-bot/shared-types';

let httpBaseUrl = '';
let authToken = '';
let apiKeyHeader = '';

function wsUrlToHttp(wsUrl: string): string {
	return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export function setGatewayConfig(gatewayUrl: string, token: string, apiKey?: string): void {
	httpBaseUrl = wsUrlToHttp(gatewayUrl);
	authToken = token;
	apiKeyHeader = apiKey ?? '';
}

export function setGatewayBaseUrl(gatewayUrl: string, apiKey?: string): void {
	httpBaseUrl = wsUrlToHttp(gatewayUrl);
	apiKeyHeader = apiKey ?? '';
}

async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...init?.headers as Record<string, string>
	};
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}
	if (apiKeyHeader) {
		headers['X-Api-Key'] = apiKeyHeader;
	}
	const response = await fetch(`${httpBaseUrl}${path}`, {
		...init,
		headers
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
			error?: string;
		};
		throw new Error(body.error ?? `Request failed with status ${response.status}`);
	}

	return (await response.json()) as T;
}

export function fetchSigningBundle(signingId: string): Promise<SigningBundle> {
	return gatewayFetch<SigningBundle>(`/api/signing/${signingId}`);
}

export function completeSigningBundle(
	signingId: string,
	txHashes: string[]
): Promise<SigningCompleteResponse> {
	return gatewayFetch<SigningCompleteResponse>(`/api/signing/${signingId}/complete`, {
		method: 'POST',
		body: JSON.stringify({ txHashes })
	});
}

export function lookupToken(symbolOrAddress: string): Promise<TokenLookupResponse> {
	return gatewayFetch<TokenLookupResponse>(
		`/api/data/tokens/${encodeURIComponent(symbolOrAddress)}`
	);
}

export function fetchTokenMetadata(
	address: string,
	limit?: number
): Promise<TokenMetadataResponse> {
	const query =
		typeof limit === 'number' && Number.isFinite(limit) ? `?limit=${Math.floor(limit)}` : '';
	return gatewayFetch<TokenMetadataResponse>(
		`/api/data/token-metadata/${encodeURIComponent(address)}${query}`
	);
}

export function fetchOrderbook(
	tokenAddress: string,
	side: 'buy' | 'sell' | 'both' = 'both'
): Promise<OrderbookResponse> {
	return gatewayFetch<OrderbookResponse>(
		`/api/data/orderbook/${encodeURIComponent(tokenAddress)}?side=${side}`
	);
}

export function fetchTrades(tokenAddress: string, limit = 20): Promise<TradeHistoryResponse> {
	const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	return gatewayFetch<TradeHistoryResponse>(
		`/api/data/trades/${encodeURIComponent(tokenAddress)}?limit=${boundedLimit}`
	);
}

export function fetchNpv(cashFlows: number[], discountRate: number): Promise<NpvResponse> {
	return gatewayFetch<NpvResponse>('/api/data/npv', {
		method: 'POST',
		body: JSON.stringify({ cashFlows, discountRate })
	});
}

export function login(signature: string, message: string, address: string): Promise<LoginResponse> {
	return gatewayFetch<LoginResponse>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ signature, message, address })
	});
}
