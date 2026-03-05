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

function requireNonEmpty(name: string, value: string): string {
	if (!value.trim()) {
		throw new Error(`${name} environment variable is required`);
	}
	return value;
}

export function loadConfig(): DelegationConfig {
	const delegationEncryptionKey = requireNonEmpty(
		'DELEGATION_ENCRYPTION_KEY',
		process.env.DELEGATION_ENCRYPTION_KEY ?? ''
	);
	const dynamicDelegationPrivateKey = requireNonEmpty(
		'DYNAMIC_DELEGATION_PRIVATE_KEY',
		process.env.DYNAMIC_DELEGATION_PRIVATE_KEY ?? ''
	);
	const dynamicWebhookSecret = requireNonEmpty(
		'DYNAMIC_WEBHOOK_SECRET',
		process.env.DYNAMIC_WEBHOOK_SECRET ?? ''
	);
	const internalSecret = requireNonEmpty('INTERNAL_SECRET', process.env.INTERNAL_SECRET ?? '');

	return {
		port: parseInt(process.env.DELEGATION_PORT ?? '5000', 10),
		host: process.env.DELEGATION_HOST ?? '0.0.0.0',
		delegationEncryptionKey,
		dynamicDelegationPrivateKey,
		dynamicWebhookSecret,
		dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID ?? '',
		dynamicAdminKey: process.env.DYNAMIC_ADMIN_KEY ?? '',
		internalSecret,
		delegationTtlMs: parseInt(process.env.DELEGATION_TTL_MS ?? '86400000', 10)
	};
}
