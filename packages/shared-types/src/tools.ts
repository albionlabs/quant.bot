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
	from?: string;
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

export interface TxRequestSignatureRequest {
	to: string;
	data: string;
	value?: string;
	executionToken: string;
}

export interface TxRequestSignatureResponse {
	kind: 'evm_send_transaction';
	chainId: number;
	from: string;
	to: string;
	data: string;
	value: string;
	summary: {
		to: string;
		valueWei: string;
		dataBytes: number;
	};
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
