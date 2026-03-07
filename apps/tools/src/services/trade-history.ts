// TODO: This service will share an API client with orderbook when a unified exchange API is built.

import type { NormalizedTrade, TradeTokenAmount } from '@quant-bot/shared-types';
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

function computeReadableAmount(amount: string, decimals: number | null): string {
	if (decimals === null) return amount;
	const abs = amount.startsWith('-') ? amount.slice(1) : amount;
	const sign = amount.startsWith('-') ? '-' : '';
	const padded = abs.padStart(decimals + 1, '0');
	const intPart = padded.slice(0, padded.length - decimals) || '0';
	const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '');
	const num = parseFloat(`${sign}${intPart}${fracPart ? '.' + fracPart : ''}`);
	return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function makeTokenAmount(bc: SubgraphBalanceChange): TradeTokenAmount {
	const decimals = bc.vault.token.decimals ? parseInt(bc.vault.token.decimals) : null;
	return {
		token: bc.vault.token.id,
		symbol: bc.vault.token.symbol,
		decimals,
		amount: bc.amount,
		readableAmount: computeReadableAmount(bc.amount, decimals)
	};
}

function normalizeTrade(trade: SubgraphTrade): NormalizedTrade | null {
	const input = trade.inputVaultBalanceChange;
	const output = trade.outputVaultBalanceChange;
	if (!input || !output) return null;

	return {
		orderHash: trade.order.orderHash,
		timestamp: parseInt(trade.timestamp),
		input: makeTokenAmount(input),
		output: makeTokenAmount(output),
		txHash: trade.tradeEvent.transaction.id
	};
}

function formatTimestamp(ts: number): string {
	const d = new Date(ts * 1000);
	const mon = d.toLocaleString('en-US', { month: 'short' });
	const day = d.getDate();
	const h = d.getHours().toString().padStart(2, '0');
	const m = d.getMinutes().toString().padStart(2, '0');
	return `${mon} ${day} ${h}:${m}`;
}

function buildDisplay(trades: NormalizedTrade[], total: number): string {
	if (trades.length === 0) return 'No trades found.';

	const shown = Math.min(trades.length, 10);
	const lines: string[] = [`Recent trades (${shown} of ${total}):`];
	for (let i = 0; i < shown; i++) {
		const t = trades[i];
		const inAmt = t.input.readableAmount ?? t.input.amount;
		const outAmt = t.output.readableAmount ?? t.output.amount;
		const inSym = t.input.symbol ?? t.input.token.slice(0, 8);
		const outSym = t.output.symbol ?? t.output.token.slice(0, 8);
		const txShort = `${t.txHash.slice(0, 6)}...`;
		lines.push(`${formatTimestamp(t.timestamp)}  ${inAmt} ${inSym} -> ${outAmt} ${outSym}  tx:${txShort}`);
	}
	return lines.join('\n');
}

export async function fetchTradeHistory(
	tokenAddress: string,
	limit: number = 50,
	detail = false
): Promise<{ display: string; trades?: NormalizedTrade[]; total: number }> {
	const clampedLimit = Math.max(1, Math.min(100, limit));

	// Step 1: Get order hashes involving this token
	const orderData = await executeGraphQL<OrderHashesResult>(
		ORDERBOOK_SUBGRAPH_V6,
		ORDER_HASHES_QUERY,
		{ tokenAddress: tokenAddress.toLowerCase(), first: 100 }
	);

	const orderHashes = orderData.orders.map((o) => o.orderHash.toLowerCase());
	if (orderHashes.length === 0) {
		return { display: 'No trades found.', total: 0 };
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
	const display = buildDisplay(clamped, clamped.length);
	return {
		display,
		...(detail ? { trades: clamped } : {}),
		total: clamped.length
	};
}
