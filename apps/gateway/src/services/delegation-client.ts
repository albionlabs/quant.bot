import type { DelegationStatusResponse } from '@quant-bot/shared-types';

interface DelegationClientConfig {
	delegationServiceUrl: string;
	internalSecret: string;
}

interface DelegationCredentials {
	walletId: string;
	walletApiKey: string;
	keyShare: string;
	chainId: number;
}

interface DelegationInfo {
	id: string;
	userId: string;
	walletAddress: string;
	status: string;
	chainId: number;
	expiresAt: number;
}

async function requestJson<T>(
	config: DelegationClientConfig,
	method: string,
	path: string,
	body?: unknown,
	extraHeaders?: Record<string, string>
): Promise<T> {
	const res = await fetch(`${config.delegationServiceUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'X-Internal-Secret': config.internalSecret,
			...extraHeaders
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		const message = (err as { error?: string }).error ?? `Delegation service returned ${res.status}`;
		throw new Error(message);
	}

	return res.json() as Promise<T>;
}

function signatureHeaders(signature?: string): Record<string, string> | undefined {
	if (!signature) return undefined;
	return { 'X-Dynamic-Signature-256': signature };
}

export async function storeDelegationViaWebhook(
	config: DelegationClientConfig,
	payload: unknown,
	signature?: string
): Promise<{ delegationId: string }> {
	return requestJson(config, 'POST', '/webhook/created', payload, signatureHeaders(signature));
}

export async function revokeDelegationViaWebhook(
	config: DelegationClientConfig,
	payload: unknown,
	signature?: string
): Promise<{ status: string }> {
	return requestJson(config, 'POST', '/webhook/revoked', payload, signatureHeaders(signature));
}

export async function getDelegationStatus(
	config: DelegationClientConfig,
	userId: string
): Promise<DelegationStatusResponse> {
	return requestJson(config, 'GET', `/status/${encodeURIComponent(userId)}`);
}

export async function getDelegationById(
	config: DelegationClientConfig,
	delegationId: string
): Promise<DelegationInfo> {
	return requestJson(config, 'GET', `/delegation/${encodeURIComponent(delegationId)}`);
}

export async function activateDelegation(
	config: DelegationClientConfig,
	userId: string,
	delegationId: string
): Promise<{ activeDelegationId: string }> {
	return requestJson(config, 'POST', '/activate', { userId, delegationId });
}

export async function revokeDelegation(
	config: DelegationClientConfig,
	userId: string
): Promise<{ status: string }> {
	return requestJson(config, 'POST', '/revoke', { userId });
}

export async function getCredentials(
	config: DelegationClientConfig,
	userId: string
): Promise<DelegationCredentials> {
	return requestJson(config, 'GET', `/credentials/${encodeURIComponent(userId)}`);
}
