export interface GatewayConfig {
	port: number;
	host: string;
	jwtSecret: string;
	jwtExpiry: string;
	agentWsUrl: string;
	openclawGatewayToken: string;
	rateLimitMax: number;
	rateLimitWindow: number;
	authRateLimitMax: number;
	corsOrigin: string[];
	delegationEncryptionKey: string;
	dynamicWebhookSecret: string;
	dynamicDelegationPrivateKey: string;
	internalSecret: string;
	delegationTtlMs: number;
}

export function loadConfig(): GatewayConfig {
	const jwtSecret = process.env.JWT_SECRET;
	if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

	const corsOrigin = process.env.CORS_ORIGIN
		? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
		: ['http://localhost:5173'];

	const delegationEncryptionKey = process.env.DELEGATION_ENCRYPTION_KEY ?? '';
	const dynamicWebhookSecret = process.env.DYNAMIC_WEBHOOK_SECRET ?? '';
	const dynamicDelegationPrivateKey = process.env.DYNAMIC_DELEGATION_PRIVATE_KEY ?? '';
	const internalSecret = process.env.INTERNAL_SECRET ?? '';

	return {
		port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
		host: process.env.GATEWAY_HOST ?? '0.0.0.0',
		jwtSecret,
		jwtExpiry: process.env.JWT_EXPIRY ?? '24h',
		agentWsUrl: process.env.AGENT_WS_URL ?? 'ws://agent:18789',
		openclawGatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN ?? '',
		rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10),
		rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60000', 10),
		authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '5', 10),
		corsOrigin,
		delegationEncryptionKey,
		dynamicWebhookSecret,
		dynamicDelegationPrivateKey,
		internalSecret,
		delegationTtlMs: parseInt(process.env.DELEGATION_TTL_MS ?? '86400000', 10)
	};
}
