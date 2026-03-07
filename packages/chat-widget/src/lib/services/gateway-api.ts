import type { SigningBundle, SigningCompleteResponse } from '@quant-bot/shared-types';

let httpBaseUrl = '';
let authToken = '';

function wsUrlToHttp(wsUrl: string): string {
	return wsUrl
		.replace(/^wss:\/\//, 'https://')
		.replace(/^ws:\/\//, 'http://');
}

export function setGatewayConfig(gatewayUrl: string, token: string): void {
	httpBaseUrl = wsUrlToHttp(gatewayUrl);
	authToken = token;
}

async function gatewayFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${httpBaseUrl}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
			...init?.headers
		}
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
		throw new Error(body.error ?? `Request failed with status ${response.status}`);
	}

	return await response.json() as T;
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
