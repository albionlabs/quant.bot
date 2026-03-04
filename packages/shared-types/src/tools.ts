export interface NpvRequest {
	cashFlows: number[];
	discountRate: number;
}

export interface NpvResponse {
	npv: number;
	irr?: number;
}

export interface EvmSimulateRequest {
	to: string;
	data?: string;
	value?: string;
	abi?: unknown[];
	functionName?: string;
	args?: unknown[];
}

export interface EvmSimulateResponse {
	success: boolean;
	returnData: string;
	gasUsed: string;
	decoded?: unknown;
}

export interface TxExecuteRequest {
	to: string;
	data: string;
	value?: string;
	executionToken: string;
	delegationId?: string;
	userId?: string;
}

export interface TxExecuteResponse {
	txHash: string;
	blockNumber: number;
	status: 'success' | 'reverted';
}

export interface SubgraphQueryRequest {
	subgraph: string;
	query: string;
	variables?: Record<string, unknown>;
}

export interface SubgraphQueryResponse {
	data: unknown;
	errors?: Array<{ message: string }>;
}
