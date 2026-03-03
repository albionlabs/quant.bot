export interface ToolsConfig {
	port: number;
	host: string;
	rpcUrl: string;
	chainName: string;
	allowedSubgraphs: string[];
	delegationServiceUrl: string;
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
		delegationServiceUrl: process.env.DELEGATION_SERVICE_URL ?? 'http://delegation.quant-bot.internal:5000',
		internalSecret: process.env.INTERNAL_SECRET ?? '',
		dynamicEnvironmentId: process.env.DYNAMIC_ENVIRONMENT_ID ?? '',
		dynamicApiKey: process.env.DYNAMIC_API_KEY ?? ''
	};
}
