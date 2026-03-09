// TODO: This service will share an API client with trade-history when a unified exchange API is built.

import type { OrderSummary, OrderbookResponse, OrderbookSide } from '@quant-bot/shared-types';
import type { ToolsConfig } from '../config.js';
import { executeGraphQL } from './graphql-client.js';
import { callRaindexMcpTool } from './raindex-mcp-client.js';
import { ORDERBOOK_SUBGRAPH_V6, USDC_ADDRESS, ORDERBOOK_ADDRESS, CHAIN_ID } from '../constants.js';

interface SubgraphVault {
	token: {
		address: string;
		symbol: string | null;
		decimals: string | null;
	};
	balance: string;
}

interface SubgraphOrder {
	orderHash: string;
	owner: string;
	active: boolean;
	inputs: SubgraphVault[];
	outputs: SubgraphVault[];
}

interface OrdersQueryResult {
	orders: SubgraphOrder[];
}

const TOKEN_ORDERS_QUERY = `
query TokenOrders($tokenAddress: Bytes!, $first: Int!) {
  orders(
    where: {
      and: [
        { active: true },
        {
          or: [
            { inputs_: { token: $tokenAddress } },
            { outputs_: { token: $tokenAddress } }
          ]
        }
      ]
    }
    orderBy: timestampAdded
    orderDirection: desc
    first: $first
  ) {
    orderHash
    owner
    active
    inputs {
      token {
        address
        symbol
        decimals
      }
      balance
    }
    outputs {
      token {
        address
        symbol
        decimals
      }
      balance
    }
  }
}
`;

interface QuoteResult {
	maxOutput?: string;
	ratio?: string;
}

interface McpQuoteEntry {
	pair?: string;
	success?: boolean;
	maxOutput?: string;
	ratio?: string;
	inverseRatio?: string;
	error?: string;
}

async function fetchQuote(
	config: ToolsConfig,
	orderHash: string
): Promise<QuoteResult | null> {
	try {
		const result = await callRaindexMcpTool(config, 'raindex_get_order_quotes', {
			chain_id: CHAIN_ID,
			orderbook_address: ORDERBOOK_ADDRESS,
			order_hash: orderHash
		});

		if (!result || typeof result !== 'object') return null;

		// The MCP tool returns an array of quote entries, one per trading pair.
		// Find the first successful quote.
		const entries = Array.isArray(result) ? result as McpQuoteEntry[] : [result as McpQuoteEntry];
		const hit = entries.find((e) => e.success !== false && (e.ratio || e.maxOutput));

		if (!hit) return null;

		return {
			maxOutput: typeof hit.maxOutput === 'string' ? hit.maxOutput : undefined,
			ratio: typeof hit.ratio === 'string' ? hit.ratio : undefined
		};
	} catch (error) {
		console.warn(`[orderbook] Failed to fetch quote for ${orderHash}:`, error);
		return null;
	}
}

/**
 * Classify an order's side based on USDC direction.
 * - Order outputs USDC -> bid (buying the token with USDC)
 * - Order inputs USDC -> ask (selling the token for USDC)
 */
function classifySide(order: SubgraphOrder): OrderbookSide | null {
	const usdcLower = USDC_ADDRESS.toLowerCase();
	const outputsUsdc = order.outputs.some(
		(v) => v.token.address.toLowerCase() === usdcLower
	);
	const inputsUsdc = order.inputs.some(
		(v) => v.token.address.toLowerCase() === usdcLower
	);

	if (outputsUsdc) return 'buy';
	if (inputsUsdc) return 'sell';
	return null;
}

function parsePrice(ratio: string | undefined): number | null {
	if (!ratio) return null;
	const parsed = parseFloat(ratio);
	return isFinite(parsed) ? parsed : null;
}

function invertPrice(price: number | null): number | null {
	if (price === null || price === 0) return null;
	return 1 / price;
}

function formatPrice(price: number | null): string {
	if (price === null) return '—';
	if (price < 0.01) return `$${price.toPrecision(3)}`;
	return `$${price.toFixed(4)}`;
}

function formatAmount(maxOutput: string | null): string {
	if (!maxOutput) return '—';
	const num = parseFloat(maxOutput);
	if (!isFinite(num)) return '—';
	return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatRate(
	ioRatio: number | null,
	inputSymbol: string | null,
	outputSymbol: string | null
): string {
	if (ioRatio === null) return '—';
	const unit = inputSymbol && outputSymbol ? ` ${inputSymbol}/${outputSymbol}` : '';
	if (ioRatio < 0.01) return `${ioRatio.toPrecision(3)}${unit}`;
	return `${ioRatio.toFixed(4)}${unit}`;
}

function buildDisplay(
	bids: OrderSummary[],
	asks: OrderSummary[],
	nonUsdOrders: OrderSummary[],
	bestBid: number | null,
	bestAsk: number | null,
	spread: number | null
): string {
	const lines: string[] = [];

	const maxRows = Math.max(bids.length, asks.length);
	if (maxRows === 0 && nonUsdOrders.length === 0) {
		return 'No orders found.';
	}

	if (maxRows > 0) {
		lines.push('BID                    ASK');
		for (let i = 0; i < maxRows; i++) {
			const bid = bids[i];
			const ask = asks[i];
			const bidStr = bid
				? `${formatPrice(bid.price)}  ${formatAmount(bid.maxOutput)}`
				: '';
			const askStr = ask
				? `${formatPrice(ask.price)}  ${formatAmount(ask.maxOutput)}`
				: '';
			lines.push(`${bidStr.padEnd(23)}${askStr}`);
		}

		if (spread !== null && bestBid !== null) {
			const pct = ((spread / bestBid) * 100).toFixed(2);
			lines.push(`Spread: ${formatPrice(spread)} (${pct}%)`);
		}
	}

	if (nonUsdOrders.length > 0) {
		if (lines.length > 0) lines.push('');
		lines.push('NON-USD PAIRS');
		for (const order of nonUsdOrders) {
			lines.push(`${formatRate(order.ioRatio ?? null, order.inputSymbol, order.outputSymbol)}  ${formatAmount(order.maxOutput)}`);
		}
	}

	return lines.join('\n');
}

export async function fetchOrderbookDepth(
	tokenAddress: string,
	side: 'buy' | 'sell' | 'both',
	config: ToolsConfig,
	detail = false
): Promise<OrderbookResponse> {
	const data = await executeGraphQL<OrdersQueryResult>(
		ORDERBOOK_SUBGRAPH_V6,
		TOKEN_ORDERS_QUERY,
		{ tokenAddress: tokenAddress.toLowerCase(), first: 100 }
	);

	// Fetch quotes in parallel for all orders
	const quoteResults = await Promise.allSettled(
		data.orders.map((o) => fetchQuote(config, o.orderHash))
	);

	const bids: OrderSummary[] = [];
	const asks: OrderSummary[] = [];
	const nonUsdOrders: OrderSummary[] = [];

	for (let i = 0; i < data.orders.length; i++) {
		const order = data.orders[i];
		const orderSide = classifySide(order);

		const quoteSettled = quoteResults[i];
		const quote = quoteSettled.status === 'fulfilled' ? quoteSettled.value : null;
		const rawRatio = parsePrice(quote?.ratio);

		const summary: OrderSummary = {
			orderHash: order.orderHash,
			price: null,
			maxOutput: quote?.maxOutput ?? null,
			inputToken: order.inputs[0]?.token.address ?? '',
			outputToken: order.outputs[0]?.token.address ?? '',
			inputSymbol: order.inputs[0]?.token.symbol ?? null,
			outputSymbol: order.outputs[0]?.token.symbol ?? null
		};

		if (!orderSide) {
			// Non-USD pairs need ioRatio since price can't be computed
			summary.ioRatio = rawRatio;
			nonUsdOrders.push(summary);
			continue;
		}

		if (side !== 'both' && orderSide !== side) continue;

		// Bid ioratio = token/USDC → price = 1/ioratio (USDC per token)
		// Ask ioratio = USDC/token → price = ioratio directly
		summary.price = orderSide === 'buy'
			? invertPrice(rawRatio)
			: rawRatio;

		if (orderSide === 'buy') {
			bids.push(summary);
		} else {
			asks.push(summary);
		}
	}

	// Filter out orders with no available liquidity (maxOutput = 0 or null)
	const liveBids = bids.filter((o) => {
		const out = parseFloat(o.maxOutput ?? '0');
		return isFinite(out) && out > 0;
	});
	const liveAsks = asks.filter((o) => {
		const out = parseFloat(o.maxOutput ?? '0');
		return isFinite(out) && out > 0;
	});

	// Sort bids descending by price, asks ascending
	liveBids.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
	liveAsks.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

	const bestBid = liveBids[0]?.price ?? null;
	const bestAsk = liveAsks[0]?.price ?? null;
	const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

	const display = buildDisplay(liveBids, liveAsks, nonUsdOrders, bestBid, bestAsk, spread);

	return {
		tokenAddress,
		display,
		...(detail ? { bids: liveBids, asks: liveAsks } : {}),
		...(detail && nonUsdOrders.length > 0 ? { nonUsdOrders } : {}),
		bestBid,
		bestAsk,
		spread,
		bidCount: liveBids.length,
		askCount: liveAsks.length
	};
}
