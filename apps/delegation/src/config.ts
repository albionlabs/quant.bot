export interface DelegationConfig {
	port: number;
	host: string;
	delegationEncryptionKey: string;
	dynamicDelegationPrivateKey: string;
	dynamicWebhookSecret: string;
	internalSecret: string;
	delegationTtlMs: number;
}

export function loadConfig(): DelegationConfig {
	return {
		port: parseInt(process.env.DELEGATION_PORT ?? '5000', 10),
		host: process.env.DELEGATION_HOST ?? '0.0.0.0',
		delegationEncryptionKey: process.env.DELEGATION_ENCRYPTION_KEY ?? '',
		dynamicDelegationPrivateKey: process.env.DYNAMIC_DELEGATION_PRIVATE_KEY ?? '',
		dynamicWebhookSecret: process.env.DYNAMIC_WEBHOOK_SECRET ?? '',
		internalSecret: process.env.INTERNAL_SECRET ?? '',
		delegationTtlMs: parseInt(process.env.DELEGATION_TTL_MS ?? '86400000', 10)
	};
}
