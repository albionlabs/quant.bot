export interface DelegationConfig {
	port: number;
	host: string;
	delegationEncryptionKey: string;
	dynamicDelegationPrivateKey: string;
	dynamicWebhookSecret: string;
	dynamicEnvironmentId: string;
	dynamicAdminKey: string;
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
		dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID ?? '',
		dynamicAdminKey: process.env.DYNAMIC_ADMIN_KEY ?? '',
		internalSecret: process.env.INTERNAL_SECRET ?? '',
		delegationTtlMs: parseInt(process.env.DELEGATION_TTL_MS ?? '86400000', 10)
	};
}
