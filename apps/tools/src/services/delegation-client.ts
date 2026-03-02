export interface DelegationCredentials {
	walletId: string;
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

export async function fetchDelegationCredentials(
	userId: string,
	gatewayInternalUrl: string,
	internalSecret: string
): Promise<DelegationCredentials> {
	const res = await fetch(`${gatewayInternalUrl}/api/internal/delegation/credentials`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Internal-Secret': internalSecret
		},
		body: JSON.stringify({ userId })
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const message = (body as { error?: string }).error ?? `Gateway returned ${res.status}`;
		throw new Error(`Failed to fetch delegation credentials: ${message}`);
	}

	return res.json() as Promise<DelegationCredentials>;
}
