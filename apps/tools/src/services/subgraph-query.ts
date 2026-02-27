import type { SubgraphQueryRequest, SubgraphQueryResponse } from '@quant-bot/shared-types';

const SUBGRAPH_ENDPOINTS: Record<string, string> = {
	'raindex-base': 'https://api.thegraph.com/subgraphs/name/rainprotocol/raindex-base',
	'uniswap-v3-base': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base'
};

export async function querySubgraph(
	request: SubgraphQueryRequest,
	allowedSubgraphs: string[]
): Promise<SubgraphQueryResponse> {
	const endpoint = SUBGRAPH_ENDPOINTS[request.subgraph];

	if (!endpoint) {
		throw new Error(
			`Unknown subgraph: ${request.subgraph}. Available: ${Object.keys(SUBGRAPH_ENDPOINTS).join(', ')}`
		);
	}

	if (allowedSubgraphs.length > 0 && !allowedSubgraphs.includes(request.subgraph)) {
		throw new Error(`Subgraph not in allowlist: ${request.subgraph}`);
	}

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: request.query,
			variables: request.variables
		})
	});

	if (!response.ok) {
		throw new Error(`Subgraph query failed: ${response.status} ${response.statusText}`);
	}

	return (await response.json()) as SubgraphQueryResponse;
}
