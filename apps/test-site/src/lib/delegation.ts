import type { DelegationStatusResponse } from '@quant-bot/shared-types';

async function requestDelegationApi<T>(
	gatewayUrl: string,
	token: string,
	path: string,
	init?: RequestInit
): Promise<T> {
	const res = await fetch(`${gatewayUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			...(init?.headers ?? {})
		}
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? `Delegation request failed (${res.status})`);
	}
	return res.json() as Promise<T>;
}

export async function getDelegationStatus(
	gatewayUrl: string,
	token: string
): Promise<DelegationStatusResponse> {
	return requestDelegationApi(gatewayUrl, token, '/api/auth/delegation/status');
}

export async function revokeDelegation(
	gatewayUrl: string,
	token: string
): Promise<{ status: string }> {
	return requestDelegationApi(gatewayUrl, token, '/api/auth/delegation/revoke', {
		method: 'POST'
	});
}
