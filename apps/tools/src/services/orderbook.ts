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

function buildDisplay(
	bids: OrderSummary[],
	asks: OrderSummary[],
	bestBid: number | null,
	bestAsk: number | null,
	spread: number | null
): string {
	const lines: string[] = [];

	const maxRows = Math.max(bids.length, asks.length);
	if (maxRows === 0) {
		return 'No orders found.';
	}

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

	for (let i = 0; i < data.orders.length; i++) {
		const order = data.orders[i];
		const orderSide = classifySide(order);
		if (!orderSide) continue;
		if (side !== 'both' && orderSide !== side) continue;

		const quoteSettled = quoteResults[i];
		const quote = quoteSettled.status === 'fulfilled' ? quoteSettled.value : null;

		const summary: OrderSummary = {
			orderHash: order.orderHash,
			price: parsePrice(quote?.ratio),
			maxOutput: quote?.maxOutput ?? null,
			inputToken: order.inputs[0]?.token.address ?? '',
			outputToken: order.outputs[0]?.token.address ?? ''
		};

		if (orderSide === 'buy') {
			bids.push(summary);
		} else {
			asks.push(summary);
		}
	}

	// Sort bids descending by price, asks ascending
	bids.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
	asks.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

	const bestBid = bids[0]?.price ?? null;
	const bestAsk = asks[0]?.price ?? null;
	const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

	const display = buildDisplay(bids, asks, bestBid, bestAsk, spread);

	return {
		tokenAddress,
		display,
		...(detail ? { bids, asks } : {}),
		bestBid,
		bestAsk,
		spread,
		bidCount: bids.length,
		askCount: asks.length
	};
}
