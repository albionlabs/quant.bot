export interface ToolsConfig {
	port: number;
	host: string;
	rpcUrl: string;
	chainName: string;
	allowedSubgraphs: string[];
}

export function loadConfig(): ToolsConfig {
	return {
		port: parseInt(process.env.TOOLS_PORT ?? '4000', 10),
		host: process.env.TOOLS_HOST ?? '0.0.0.0',
		rpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
		chainName: process.env.CHAIN_NAME ?? 'base',
		allowedSubgraphs: (process.env.ALLOWED_SUBGRAPHS ?? '').split(',').filter(Boolean)
	};
}
