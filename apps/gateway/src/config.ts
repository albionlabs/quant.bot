import { requireNonEmpty } from '@quant-bot/shared-types';

export interface GatewayConfig {
	port: number;
	host: string;
	jwtSecret: string;
	jwtExpiry: string;
	agentWsUrl: string;
	agentResponseTimeoutMs: number;
	executionTokenTtlSeconds: number;
	openclawGatewayToken: string;
	rateLimitMax: number;
	rateLimitWindow: number;
	authRateLimitMax: number;
	corsOrigin: string[];
	delegationServiceUrl: string;
	internalSecret: string;
	dynamicWebhookSecret: string;
}

export function loadConfig(): GatewayConfig {
	const jwtSecret = requireNonEmpty('JWT_SECRET', process.env.JWT_SECRET ?? '');
	const openclawGatewayToken = requireNonEmpty('OPENCLAW_GATEWAY_TOKEN', process.env.OPENCLAW_GATEWAY_TOKEN ?? '');
	const internalSecret = requireNonEmpty('INTERNAL_SECRET', process.env.INTERNAL_SECRET ?? '');
	const dynamicWebhookSecret = requireNonEmpty('DYNAMIC_WEBHOOK_SECRET', process.env.DYNAMIC_WEBHOOK_SECRET ?? '');

	const corsOrigin = process.env.CORS_ORIGIN
		? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
		: ['http://localhost:5173'];

	return {
		port: parseInt(process.env.GATEWAY_PORT ?? '3000', 10),
		host: process.env.GATEWAY_HOST ?? '0.0.0.0',
		jwtSecret,
		jwtExpiry: process.env.JWT_EXPIRY ?? '24h',
		agentWsUrl: process.env.AGENT_WS_URL ?? 'ws://agent:18789',
		agentResponseTimeoutMs: parseInt(process.env.AGENT_RESPONSE_TIMEOUT_MS ?? '120000', 10),
		executionTokenTtlSeconds: parseInt(process.env.EXECUTION_TOKEN_TTL_SECONDS ?? '300', 10),
		openclawGatewayToken,
		rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10),
		rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60000', 10),
		authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '5', 10),
		corsOrigin,
		delegationServiceUrl: process.env.DELEGATION_SERVICE_URL ?? 'http://quant-bot.internal:5000',
		internalSecret,
		dynamicWebhookSecret
	};
}
