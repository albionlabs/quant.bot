import { requireNonEmpty } from '@quant-bot/shared-types';

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
	const dynamicEnvironmentId = requireNonEmpty(
		'DYNAMIC_ENVIRONMENT_ID',
		process.env.DYNAMIC_ENVIRONMENT_ID ?? ''
	);

	return {
		port: parseInt(process.env.DELEGATION_PORT ?? '5000', 10),
		host: process.env.DELEGATION_HOST ?? '0.0.0.0',
		delegationEncryptionKey,
		dynamicDelegationPrivateKey,
		dynamicWebhookSecret,
		dynamicEnvironmentId,
		// Optional: only needed for Dynamic admin API calls, not core delegation flow
		dynamicAdminKey: process.env.DYNAMIC_ADMIN_KEY ?? '',
		internalSecret,
		delegationTtlMs: parseInt(process.env.DELEGATION_TTL_MS ?? '86400000', 10)
	};
}
