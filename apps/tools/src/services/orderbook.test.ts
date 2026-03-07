import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOrderbookDepth } from './orderbook.js';
import type { ToolsConfig } from '../config.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOKEN = '0xf836a500910453A397084ADe41321ee20a5AAde1';

const mockConfig = {
	raindexMcpCommand: 'node',
	raindexMcpArgs: [],
	raindexMcpCwd: '',
	raindexSettingsPath: '',
	raindexSettingsYaml: 'test: true',
	raindexSettingsUrl: '',
	raindexRegistryUrl: ''
} as unknown as ToolsConfig;

function makeOrder(hash: string, inputToken: string, outputToken: string) {
	return {
		orderHash: hash,
		owner: '0xowner',
		active: true,
		inputs: [{
			token: { address: inputToken, symbol: null, decimals: '18' },
			balance: '1000'
		}],
		outputs: [{
			token: { address: outputToken, symbol: null, decimals: '18' },
			balance: '1000'
		}]
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

// Mock the MCP client module
vi.mock('./raindex-mcp-client.js', () => ({
	callRaindexMcpTool: vi.fn().mockResolvedValue({
		maxOutput: '100',
		ratio: '1.5'
	}),
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
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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
		expect(result.bestBid).toBe(1.5);
		expect(result.bestAsk).toBe(1.5);
		expect(result.bidCount).toBe(1);
		expect(result.askCount).toBe(1);
		expect(result.display).toContain('BID');
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
