import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTradeHistory } from './trade-history.js';

function makeTradeResponse(trades: unknown[]) {
	return new Response(
		JSON.stringify({ data: { trades } }),
		{ status: 200 }
	);
}

function makeTrade(id: string, orderHash: string, timestamp: string) {
	return {
		id,
		order: { orderHash },
		timestamp,
		inputVaultBalanceChange: {
			amount: '1000000',
			vault: {
				token: { id: '0xusdc', symbol: 'USDC', decimals: '6' }
			}
		},
		outputVaultBalanceChange: {
			amount: '500000000000000000',
			vault: {
				token: { id: '0xtoken', symbol: 'ALB', decimals: '18' }
			}
		},
		tradeEvent: {
			transaction: { id: '0xtxhash1' }
		}
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('fetchTradeHistory', () => {
	it('fetches order hashes then trades from both subgraphs', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		// Call 1: order hashes query
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: { orders: [{ orderHash: '0xorder1' }] }
				}),
				{ status: 200 }
			)
		);

		// Call 2: v6 trades
		fetchSpy.mockResolvedValueOnce(
			makeTradeResponse([makeTrade('trade-1', '0xorder1', '1700000100')])
		);

		// Call 3: legacy trades
		fetchSpy.mockResolvedValueOnce(
			makeTradeResponse([makeTrade('trade-2', '0xorder1', '1700000000')])
		);

		const result = await fetchTradeHistory('0xf836a500910453A397084ADe41321ee20a5AAde1', 50, true);
		expect(result.trades).toHaveLength(2);
		// Should be sorted by timestamp descending
		expect(result.trades![0].timestamp).toBe(1700000100);
		expect(result.trades![1].timestamp).toBe(1700000000);
		expect(result.trades![0].input.readableAmount).toBeDefined();
		expect(result.display).toContain('Recent trades');

		const orderHashesQueryBody = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
		expect(orderHashesQueryBody.query).toContain('and: [');
		expect(orderHashesQueryBody.query).toContain('{ active: true }');
		expect(orderHashesQueryBody.query).toContain('or: [');
	});

	it('omits trades array when detail is false', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: { orders: [{ orderHash: '0xorder1' }] }
				}),
				{ status: 200 }
			)
		);

		fetchSpy.mockResolvedValueOnce(
			makeTradeResponse([makeTrade('trade-1', '0xorder1', '1700000100')])
		);
		fetchSpy.mockResolvedValueOnce(makeTradeResponse([]));

		const result = await fetchTradeHistory('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.trades).toBeUndefined();
		expect(result.total).toBe(1);
		expect(result.display).toContain('Recent trades');
	});

	it('deduplicates trades by ID (v6 overwrites legacy)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: { orders: [{ orderHash: '0xorder1' }] }
				}),
				{ status: 200 }
			)
		);

		// Same trade ID from both subgraphs
		fetchSpy.mockResolvedValueOnce(
			makeTradeResponse([makeTrade('trade-dup', '0xorder1', '1700000100')])
		);
		fetchSpy.mockResolvedValueOnce(
			makeTradeResponse([makeTrade('trade-dup', '0xorder1', '1700000000')])
		);

		const result = await fetchTradeHistory('0xf836a500910453A397084ADe41321ee20a5AAde1', 50, true);
		expect(result.trades).toHaveLength(1);
		// v6 version should win (timestamp 1700000100)
		expect(result.trades![0].timestamp).toBe(1700000100);
	});

	it('returns empty when no orders exist', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({ data: { orders: [] } }),
				{ status: 200 }
			)
		);

		const result = await fetchTradeHistory('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.trades).toBeUndefined();
		expect(result.total).toBe(0);
		expect(result.display).toBe('No trades found.');
	});

	it('clamps limit between 1 and 100', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: { orders: [{ orderHash: '0xorder1' }] }
				}),
				{ status: 200 }
			)
		);

		fetchSpy.mockResolvedValueOnce(makeTradeResponse([]));
		fetchSpy.mockResolvedValueOnce(makeTradeResponse([]));

		const result = await fetchTradeHistory('0xf836a500910453A397084ADe41321ee20a5AAde1', 200);
		expect(result.total).toBe(0);
		// Verify the query was called with clamped limit (100)
		const v6Call = fetchSpy.mock.calls[1];
		const body = JSON.parse(v6Call[1]!.body as string);
		expect(body.variables.first).toBe(100);
	});
});
