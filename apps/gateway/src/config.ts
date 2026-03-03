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
	delegationServiceUrl: string;
	internalSecret: string;
}

export function loadConfig(): GatewayConfig {
	const jwtSecret = process.env.JWT_SECRET;
	if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

	const corsOrigin = process.env.CORS_ORIGIN
		? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
		: ['http://localhost:5173'];

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
		delegationServiceUrl: process.env.DELEGATION_SERVICE_URL ?? 'http://quant-bot.internal:5000',
		internalSecret: process.env.INTERNAL_SECRET ?? ''
	};
}
