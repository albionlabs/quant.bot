import type { DelegationCredentials } from '@quant-bot/shared-types';

export type { DelegationCredentials };

function tag(attemptId?: string): string {
	return attemptId ? `[creds:${attemptId}]` : '[creds]';
}

export async function fetchDelegationCredentials(
	userId: string,
	delegationServiceUrl: string,
	internalSecret: string,
	attemptId?: string
): Promise<DelegationCredentials> {
	const started = performance.now();
	console.log(`${tag(attemptId)} FETCH_START:`, { userId });

	const headers: Record<string, string> = {
		'X-Internal-Secret': internalSecret
	};
	if (attemptId) {
		headers['X-Attempt-Id'] = attemptId;
	}

	const res = await fetch(`${delegationServiceUrl}/credentials/${encodeURIComponent(userId)}`, {
		method: 'GET',
		headers
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const message = (body as { error?: string }).error ?? `Delegation service returned ${res.status}`;
		console.warn(`${tag(attemptId)} FETCH_FAIL:`, {
			userId,
			status: res.status,
			message,
			elapsedMs: Math.round(performance.now() - started)
		});
		throw new Error(message);
	}

	const credentials = await res.json() as DelegationCredentials;
	console.log(`${tag(attemptId)} FETCH_OK:`, {
		userId,
		walletId: credentials.walletId,
		walletAddress: credentials.walletAddress,
		keyShareLength: credentials.keyShare?.length ?? null,
		elapsedMs: Math.round(performance.now() - started)
	});

	return credentials;
}
