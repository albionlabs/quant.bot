import type { DelegationStatusResponse, DelegationActivateResponse } from '@quant-bot/shared-types';

export async function getDelegationStatus(
	gatewayUrl: string,
	token: string
): Promise<DelegationStatusResponse> {
	const res = await fetch(`${gatewayUrl}/api/auth/delegation/status`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? 'Failed to fetch delegation status');
	}
	return res.json();
}

export async function activateDelegation(
	gatewayUrl: string,
	token: string,
	delegationId: string,
	walletAddress: string
): Promise<DelegationActivateResponse> {
	const res = await fetch(`${gatewayUrl}/api/auth/delegation/activate`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({ delegationId, walletAddress })
	});
	if (!res.ok) throw new Error('Failed to activate delegation');
	return res.json();
}

export async function revokeDelegation(
	gatewayUrl: string,
	token: string
): Promise<{ status: string }> {
	const res = await fetch(`${gatewayUrl}/api/auth/delegation/revoke`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? 'Failed to revoke delegation');
	}
	return res.json();
}
