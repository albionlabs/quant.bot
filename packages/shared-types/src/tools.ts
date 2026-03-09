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
	display: string;
	latest: DecodedMetaEntry | null;
	history: DecodedMetaEntry[];
}

export interface MetadataLoadResponse {
	address: string;
	schema: unknown;
	cachedUntil: number;
}

export interface MetadataFieldsResponse {
	address: string;
	fields: Record<string, unknown>;
}

// ── Orderbook Depth ─────────────────────────────────────────────────

export interface OrderSummary {
	orderHash: string;
	price: number | null;
	ioRatio?: number | null;
	maxOutput: string | null;
	inputToken: string;
	outputToken: string;
	inputSymbol: string | null;
	outputSymbol: string | null;
}

export type OrderbookSide = 'buy' | 'sell';

export interface OrderbookResponse {
	tokenAddress: string;
	display: string;
	bids?: OrderSummary[];
	asks?: OrderSummary[];
	nonUsdOrders?: OrderSummary[];
	bestBid: number | null;
	bestAsk: number | null;
	spread: number | null;
	bidCount: number;
	askCount: number;
}

// ── Trade History ───────────────────────────────────────────────────

export interface TradeTokenAmount {
	token: string;
	symbol: string | null;
	decimals: number | null;
	amount: string;
	readableAmount?: string;
}

export interface NormalizedTrade {
	orderHash: string;
	timestamp: number;
	input: TradeTokenAmount;
	output: TradeTokenAmount;
	txHash: string;
}

export interface TradeHistoryResponse {
	tokenAddress: string;
	display: string;
	trades?: NormalizedTrade[];
	total: number;
}

// ── Staged Signing ─────────────────────────────────────────────────

export interface StagedTransaction {
	label: string;
	to: string;
	data: string;
	value?: string;
	symbol?: string;
}

export interface TransactionSimulation {
	index: number;
	label: string;
	success: boolean;
	status?: 'ok' | 'requires_prior_state' | 'failed';
	reasonCode?: string;
	gasUsed: string;
	error?: string;
}

export interface StageSigningRequest {
	executionToken: string;
	transactions: StagedTransaction[];
	metadata?: {
		operationType?: string;
		strategyKey?: string;
		composedRainlang?: string;
	};
}

export interface StageSigningResponse {
	signingId: string;
	summary: string;
	simulations: TransactionSimulation[];
	readyToSign: boolean;
	allSimulationsSucceeded: boolean;
}

export interface SigningBundle {
	signingId: string;
	chainId: number;
	from: string;
	transactions: Array<StagedTransaction & { simulation: TransactionSimulation }>;
	metadata?: StageSigningRequest['metadata'];
	expiresAt: number;
}

export interface SigningCompleteRequest {
	txHashes: string[];
}

export interface SigningCompleteResponse {
	success: boolean;
	orderHash?: string;
	raindexUrl?: string;
	message?: string;
}
