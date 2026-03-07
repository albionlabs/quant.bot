// TODO: This service will share an API client with orderbook when a unified exchange API is built.

import type { NormalizedTrade } from '@quant-bot/shared-types';
import { executeGraphQL } from './graphql-client.js';
import { ORDERBOOK_SUBGRAPH_V6, ORDERBOOK_SUBGRAPH_LEGACY } from '../constants.js';

interface SubgraphBalanceChange {
	amount: string;
	vault: {
		token: {
			id: string;
			symbol: string | null;
			decimals: string | null;
		};
	};
}

interface SubgraphTrade {
	id: string;
	order: { orderHash: string };
	timestamp: string;
	inputVaultBalanceChange: SubgraphBalanceChange | null;
	outputVaultBalanceChange: SubgraphBalanceChange | null;
	tradeEvent: {
		transaction: {
			id: string;
		};
	};
}

interface OrderHashesResult {
	orders: Array<{ orderHash: string }>;
}

interface TradesResult {
	trades: SubgraphTrade[];
}

const ORDER_HASHES_QUERY = `
query OrderHashes($tokenAddress: Bytes!, $first: Int!) {
  orders(
    where: {
      active: true,
      or: [
        { inputs_: { token: $tokenAddress } },
        { outputs_: { token: $tokenAddress } }
      ]
    }
    first: $first
  ) {
    orderHash
  }
}
`;

const TRADES_QUERY = `
query TradesForOrders($orderHashes: [Bytes!]!, $first: Int!) {
  trades(
    where: { order_: { orderHash_in: $orderHashes } }
    orderBy: timestamp
    orderDirection: desc
    first: $first
  ) {
    id
    order {
      orderHash
    }
    timestamp
    inputVaultBalanceChange {
      amount
      vault {
        token {
          id
          symbol
          decimals
        }
      }
    }
    outputVaultBalanceChange {
      amount
      vault {
        token {
          id
          symbol
          decimals
        }
      }
    }
    tradeEvent {
      transaction {
        id
      }
    }
  }
}
`;

function normalizeTrade(trade: SubgraphTrade): NormalizedTrade | null {
	const input = trade.inputVaultBalanceChange;
	const output = trade.outputVaultBalanceChange;
	if (!input || !output) return null;

	return {
		id: trade.id,
		orderHash: trade.order.orderHash,
		timestamp: parseInt(trade.timestamp),
		input: {
			token: input.vault.token.id,
			symbol: input.vault.token.symbol,
			decimals: input.vault.token.decimals ? parseInt(input.vault.token.decimals) : null,
			amount: input.amount
		},
		output: {
			token: output.vault.token.id,
			symbol: output.vault.token.symbol,
			decimals: output.vault.token.decimals ? parseInt(output.vault.token.decimals) : null,
			amount: output.amount
		},
		txHash: trade.tradeEvent.transaction.id
	};
}

export async function fetchTradeHistory(
	tokenAddress: string,
	limit: number = 50
): Promise<{ trades: NormalizedTrade[]; total: number }> {
	const clampedLimit = Math.max(1, Math.min(100, limit));

	// Step 1: Get order hashes involving this token
	const orderData = await executeGraphQL<OrderHashesResult>(
		ORDERBOOK_SUBGRAPH_V6,
		ORDER_HASHES_QUERY,
		{ tokenAddress: tokenAddress.toLowerCase(), first: 100 }
	);

	const orderHashes = orderData.orders.map((o) => o.orderHash.toLowerCase());
	if (orderHashes.length === 0) {
		return { trades: [], total: 0 };
	}

	// Step 2: Query both v6 + legacy subgraphs in parallel
	const variables = { orderHashes, first: clampedLimit };
	const [v6Result, legacyResult] = await Promise.allSettled([
		executeGraphQL<TradesResult>(ORDERBOOK_SUBGRAPH_V6, TRADES_QUERY, variables),
		executeGraphQL<TradesResult>(ORDERBOOK_SUBGRAPH_LEGACY, TRADES_QUERY, variables)
	]);

	const v6Trades = v6Result.status === 'fulfilled' ? v6Result.value.trades : [];
	const legacyTrades = legacyResult.status === 'fulfilled' ? legacyResult.value.trades : [];

	if (v6Result.status === 'rejected') {
		console.warn('[trade-history] v6 subgraph query failed:', v6Result.reason);
	}
	if (legacyResult.status === 'rejected') {
		console.warn('[trade-history] Legacy subgraph query failed:', legacyResult.reason);
	}

	// Step 3: Deduplicate by trade ID (v6 overwrites legacy)
	const deduped = new Map<string, SubgraphTrade>();
	for (const trade of legacyTrades) {
		deduped.set(trade.id, trade);
	}
	for (const trade of v6Trades) {
		deduped.set(trade.id, trade);
	}

	// Step 4: Normalize and sort
	const normalized: NormalizedTrade[] = [];
	for (const trade of deduped.values()) {
		const n = normalizeTrade(trade);
		if (n) normalized.push(n);
	}

	normalized.sort((a, b) => b.timestamp - a.timestamp);

	const clamped = normalized.slice(0, clampedLimit);
	return { trades: clamped, total: clamped.length };
}
