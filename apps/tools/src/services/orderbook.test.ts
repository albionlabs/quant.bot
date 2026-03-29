import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOrderbookDepth } from './orderbook.js';
import type { ToolsConfig } from '../config.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOKEN = '0xf836a500910453A397084ADe41321ee20a5AAde1';
const WETH = '0x4200000000000000000000000000000000000006';

const mockConfig = {
	raindexMcpCommand: 'node',
	raindexMcpArgs: [],
	raindexMcpCwd: '',
	raindexSettingsPath: '',
	raindexSettingsYaml: 'test: true',
	raindexSettingsUrl: '',
	raindexRegistryUrl: ''
} as unknown as ToolsConfig;

function makeOrder(
	hash: string,
	inputToken: string,
	outputToken: string,
	inputSymbol: string | null = null,
	outputSymbol: string | null = null
) {
	return {
		orderHash: hash,
		owner: '0xowner',
		active: true,
		inputs: [{
			token: { address: inputToken, symbol: inputSymbol, decimals: '18' },
			balance: '1000'
		}],
		outputs: [{
			token: { address: outputToken, symbol: outputSymbol, decimals: '18' },
			balance: '1000'
		}]
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

// Mock the MCP client module
vi.mock('./raindex-mcp-client.js', () => ({
	callRaindexMcpTool: vi.fn().mockResolvedValue([{
		pair: 'USDC/TOKEN',
		success: true,
		maxOutput: '100',
		ratio: '1.5'
	}]),
	RaindexMcpError: class extends Error {
		status: number;
		source = 'raindex-mcp' as const;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
}));

describe('fetchOrderbookDepth', () => {
	it('classifies bids and asks based on USDC direction', async () => {
		// Bid: outputs USDC (buying token with USDC)
		// Ask: inputs USDC (selling token for USDC)
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC),  // outputs USDC -> bid
							makeOrder('0xask1', USDC, TOKEN)   // inputs USDC -> ask
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig, true);
		expect(result.bids).toHaveLength(1);
		expect(result.asks).toHaveLength(1);
		expect(result.bids![0].orderHash).toBe('0xbid1');
		expect(result.asks![0].orderHash).toBe('0xask1');
		// Bid ioratio 1.5 → price = 1/1.5 ≈ 0.6667
		expect(result.bestBid).toBeCloseTo(1 / 1.5, 4);
		// Ask ioratio 1.5 → price = 1.5 directly
		expect(result.bestAsk).toBe(1.5);
		expect(result.bidCount).toBe(1);
		expect(result.askCount).toBe(1);
		expect(result.display).toContain('BID');

		const queryBody = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
		expect(queryBody.query).toContain('and: [');
		expect(queryBody.query).toContain('{ active: true }');
		expect(queryBody.query).toContain('or: [');
	});

	it('inverts bid ioratio to compute correct USD price', async () => {
		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		vi.mocked(callRaindexMcpTool).mockResolvedValue([{
			pair: 'TOKEN/USDC',
			success: true,
			maxOutput: '500',
			ratio: '10'
		}]);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC)  // outputs USDC -> bid
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig, true);
		// Bid ioratio = 10 → price = 1/10 = 0.10
		expect(result.bids![0].price).toBeCloseTo(0.1, 6);
		expect(result.bids![0].ioRatio).toBeUndefined();
		expect(result.bestBid).toBeCloseTo(0.1, 6);
	});

	it('uses ask ioratio directly as USD price', async () => {
		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		vi.mocked(callRaindexMcpTool).mockResolvedValue([{
			pair: 'USDC/TOKEN',
			success: true,
			maxOutput: '200',
			ratio: '0.95'
		}]);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xask1', USDC, TOKEN)  // inputs USDC -> ask
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig, true);
		expect(result.asks![0].price).toBe(0.95);
		expect(result.asks![0].ioRatio).toBeUndefined();
		expect(result.bestAsk).toBe(0.95);
	});

	it('handles non-USDC pairs with ioRatio and symbols', async () => {
		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		vi.mocked(callRaindexMcpTool).mockResolvedValue([{
			pair: 'TOKEN/WETH',
			success: true,
			maxOutput: '50',
			ratio: '3500'
		}]);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xother1', TOKEN, WETH, 'ALB', 'WETH')
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig, true);
		expect(result.bidCount).toBe(0);
		expect(result.askCount).toBe(0);
		expect(result.nonUsdOrders).toHaveLength(1);
		expect(result.nonUsdOrders![0].price).toBeNull();
		expect(result.nonUsdOrders![0].ioRatio).toBe(3500);
		expect(result.nonUsdOrders![0].inputSymbol).toBe('ALB');
		expect(result.nonUsdOrders![0].outputSymbol).toBe('WETH');
		expect(result.display).toContain('NON-USD PAIRS');
		expect(result.display).toContain('ALB/WETH');
	});

	it('omits arrays when detail is false', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC),
							makeOrder('0xask1', USDC, TOKEN)
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig);
		expect(result.bids).toBeUndefined();
		expect(result.asks).toBeUndefined();
		expect(result.bidCount).toBe(1);
		expect(result.askCount).toBe(1);
		expect(result.display).toContain('BID');
	});

	it('filters by side when requested', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC),
							makeOrder('0xask1', USDC, TOKEN)
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'buy', mockConfig, true);
		expect(result.bids).toHaveLength(1);
		expect(result.asks).toHaveLength(0);
	});

	it('filters out orders with failed quotes (no liquidity)', async () => {
		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		vi.mocked(callRaindexMcpTool).mockResolvedValue([{
			pair: 'USDC/TOKEN',
			success: false,
			error: 'Execution reverted with error: StalePrice'
		}]);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC)
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig, true);
		// Failed quote → null maxOutput → filtered out
		expect(result.bids).toHaveLength(0);
		expect(result.bestBid).toBeNull();
	});

	it('handles subgraph query failure gracefully', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('subgraph down'));

		await expect(
			fetchOrderbookDepth(TOKEN, 'both', mockConfig)
		).rejects.toThrow();
	});

	it('handles quote failure for individual orders (Promise.allSettled)', async () => {
		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		vi.mocked(callRaindexMcpTool).mockRejectedValue(new Error('MCP unavailable'));

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						orders: [
							makeOrder('0xbid1', TOKEN, USDC),
							makeOrder('0xask1', USDC, TOKEN)
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig);
		// Orders exist but quotes all failed → no live liquidity
		expect(result.bidCount).toBe(0);
		expect(result.askCount).toBe(0);
		expect(result.bestBid).toBeNull();
		expect(result.bestAsk).toBeNull();
	});

	it('returns empty orderbook when no orders exist', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({ data: { orders: [] } }),
				{ status: 200 }
			)
		);

		const result = await fetchOrderbookDepth(TOKEN, 'both', mockConfig);
		expect(result.bidCount).toBe(0);
		expect(result.askCount).toBe(0);
		expect(result.bestBid).toBeNull();
		expect(result.bestAsk).toBeNull();
		expect(result.spread).toBeNull();
		expect(result.display).toBe('No orders found.');
	});
});
