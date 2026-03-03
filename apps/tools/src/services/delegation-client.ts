export interface DelegationCredentials {
	walletId: string;
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

export async function fetchDelegationCredentials(
	userId: string,
	delegationServiceUrl: string,
	internalSecret: string
): Promise<DelegationCredentials> {
	const res = await fetch(`${delegationServiceUrl}/credentials/${encodeURIComponent(userId)}`, {
		method: 'GET',
		headers: {
			'X-Internal-Secret': internalSecret
		}
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const message = (body as { error?: string }).error ?? `Delegation service returned ${res.status}`;
		throw new Error(message);
	}

	return res.json() as Promise<DelegationCredentials>;
}
