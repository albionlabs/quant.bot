import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./graphql-client.js', () => ({
	executeGraphQL: vi.fn()
}));

import { fetchOwnerOrders } from './owner-orders.js';
import { executeGraphQL } from './graphql-client.js';

const mockedExecuteGraphQL = vi.mocked(executeGraphQL);

describe('fetchOwnerOrders', () => {
	beforeEach(() => {
		mockedExecuteGraphQL.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('transforms subgraph response to OwnerOrder format', async () => {
		mockedExecuteGraphQL.mockResolvedValue({
			orders: [
				{
					orderHash: '0xabc',
					owner: '0xowner',
					active: true,
					timestampAdded: '1700000000',
					inputs: [
						{
							token: { address: '0xtoken1', symbol: 'USDC', decimals: '6' },
							balance: '1000000'
						}
					],
					outputs: [
						{
							token: { address: '0xtoken2', symbol: null, decimals: null },
							balance: '500'
						}
					]
				}
			]
		});

		const orders = await fetchOwnerOrders('0xOwner', 10);
		expect(orders).toHaveLength(1);
		expect(orders[0]).toEqual({
			orderHash: '0xabc',
			owner: '0xowner',
			active: true,
			timestampAdded: 1700000000,
			inputs: [
				{ token: '0xtoken1', symbol: 'USDC', decimals: 6, balance: '1000000' }
			],
			outputs: [
				{ token: '0xtoken2', symbol: null, decimals: null, balance: '500' }
			]
		});
	});

	it('lowercases owner address in query', async () => {
		mockedExecuteGraphQL.mockResolvedValue({ orders: [] });

		await fetchOwnerOrders('0xABCDEF', 5);

		const [, , variables] = mockedExecuteGraphQL.mock.calls[0];
		expect(variables!.owner).toBe('0xabcdef');
		expect(variables!.first).toBe(5);
	});

	it('returns empty array when no orders', async () => {
		mockedExecuteGraphQL.mockResolvedValue({ orders: [] });
		const orders = await fetchOwnerOrders('0xowner', 10);
		expect(orders).toEqual([]);
	});

	it('handles orders with null decimals', async () => {
		mockedExecuteGraphQL.mockResolvedValue({
			orders: [
				{
					orderHash: '0x123',
					owner: '0xowner',
					active: false,
					timestampAdded: '1700000000',
					inputs: [
						{
							token: { address: '0xt', symbol: 'X', decimals: null },
							balance: '0'
						}
					],
					outputs: []
				}
			]
		});

		const orders = await fetchOwnerOrders('0xowner', 1);
		expect(orders[0].inputs[0].decimals).toBeNull();
	});
});
