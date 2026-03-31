// Inlined types from @quant-bot/shared-types for standalone publishing.
// Keep in sync with packages/shared-types/src/ when modifying.

// ── Auth ────────────────────────────────────────────────────────────

export interface User {
	id: string;
	address: string;
	createdAt: number;
}

export interface LoginResponse {
	token: string;
	user: User;
}

// ── Chat ────────────────────────────────────────────────────────────

export interface ClientMessage {
	type: 'message';
	content: string;
	sessionId?: string;
}

export interface ServerMessage {
	type: 'message' | 'tool_call' | 'tool_result' | 'stream' | 'progress' | 'thinking' | 'error' | 'connected';
	sessionId: string;
	role?: 'assistant';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	toolCallId?: string;
	result?: unknown;
	delta?: string;
	status?: string;
	code?: string;
	message?: string;
	version?: string;
	minVersion?: string;
}

// ── Token Registry ──────────────────────────────────────────────────

export interface RegistryToken {
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	logoURI?: string;
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

// ── Orderbook ───────────────────────────────────────────────────────

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

// ── NPV ─────────────────────────────────────────────────────────────

export interface NpvResponse {
	npv: number;
	irr?: number;
}

// ── Staged Signing ──────────────────────────────────────────────────

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

export interface SigningBundle {
	signingId: string;
	chainId: number;
	from: string;
	transactions: Array<StagedTransaction & { simulation: TransactionSimulation }>;
	metadata?: {
		operationType?: string;
		strategyKey?: string;
		composedRainlang?: string;
	};
	expiresAt: number;
}

export interface SigningCompleteResponse {
	success: boolean;
	orderHash?: string;
	raindexUrl?: string;
	message?: string;
}
