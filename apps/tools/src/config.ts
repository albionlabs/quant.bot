export interface ToolsConfig {
	port: number;
	host: string;
	rpcUrl: string;
	chainName: string;
	allowedSubgraphs: string[];
	gatewayInternalUrl: string;
	internalSecret: string;
	dynamicEnvironmentId: string;
	dynamicApiKey: string;
}

export function loadConfig(): ToolsConfig {
	return {
		port: parseInt(process.env.TOOLS_PORT ?? '4000', 10),
		host: process.env.TOOLS_HOST ?? '0.0.0.0',
		rpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
		chainName: process.env.CHAIN_NAME ?? 'base',
		allowedSubgraphs: (process.env.ALLOWED_SUBGRAPHS ?? '').split(',').filter(Boolean),
		gatewayInternalUrl: process.env.GATEWAY_INTERNAL_URL ?? 'http://quant-bot.internal:3000',
		internalSecret: process.env.INTERNAL_SECRET ?? '',
		dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID ?? '',
		dynamicApiKey: process.env.DYNAMIC_API_KEY ?? ''
	};
}
