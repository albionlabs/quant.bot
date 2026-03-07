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

// ── Token Registry ──────────────────────────────────────────────────

export interface RegistryToken {
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	logoURI?: string;
}

export interface TokenListResponse {
	name: string;
	tokens: RegistryToken[];
	updatedAt: string;
}

export interface TokenLookupResponse {
	token: RegistryToken;
}

// ── Token Metadata ──────────────────────────────────────────────────

export interface DecodedMetaEntry {
	id: string;
	metaHash: string;
	sender: string;
	subject: string;
	decodedData: Record<string, unknown> | null;
	timestamp?: number;
}

export interface TokenMetadataResponse {
	address: string;
	latest: DecodedMetaEntry | null;
	history: DecodedMetaEntry[];
}

// ── Orderbook Depth ─────────────────────────────────────────────────

export interface OrderSummary {
	orderHash: string;
	owner: string;
	price: number | null;
	maxOutput: string | null;
	ratio: string | null;
	inputToken: string;
	outputToken: string;
}

export type OrderbookSide = 'buy' | 'sell';

export interface OrderbookResponse {
	tokenAddress: string;
	bids: OrderSummary[];
	asks: OrderSummary[];
	bestBid: number | null;
	bestAsk: number | null;
	spread: number | null;
}

// ── Trade History ───────────────────────────────────────────────────

export interface TradeTokenAmount {
	token: string;
	symbol: string | null;
	decimals: number | null;
	amount: string;
}

export interface NormalizedTrade {
	id: string;
	orderHash: string;
	timestamp: number;
	input: TradeTokenAmount;
	output: TradeTokenAmount;
	txHash: string;
}

export interface TradeHistoryResponse {
	tokenAddress: string;
	trades: NormalizedTrade[];
	total: number;
}
