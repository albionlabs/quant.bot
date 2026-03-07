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
      active: true,
      or: [
        { inputs_: { token: $tokenAddress } },
        { outputs_: { token: $tokenAddress } }
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
		const record = result as Record<string, unknown>;
		return {
			maxOutput: typeof record.maxOutput === 'string' ? record.maxOutput : undefined,
			ratio: typeof record.ratio === 'string' ? record.ratio : undefined
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

export async function fetchOrderbookDepth(
	tokenAddress: string,
	side: 'buy' | 'sell' | 'both',
	config: ToolsConfig
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
			owner: order.owner,
			price: parsePrice(quote?.ratio),
			maxOutput: quote?.maxOutput ?? null,
			ratio: quote?.ratio ?? null,
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

	return {
		tokenAddress,
		bids,
		asks,
		bestBid,
		bestAsk,
		spread
	};
}
