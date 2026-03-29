import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@quant-bot/evm-utils', () => ({
	createBasePublicClient: vi.fn()
}));

import { simulateTransaction } from './evm-simulator.js';
import { createBasePublicClient } from '@quant-bot/evm-utils';

const mockedCreateClient = vi.mocked(createBasePublicClient);

function createMockClient(overrides: Record<string, any> = {}) {
	return {
		simulateContract: vi.fn().mockResolvedValue({
			result: 'ok',
			request: { data: '0xencoded' }
		}),
		estimateGas: vi.fn().mockResolvedValue(21000n),
		call: vi.fn().mockResolvedValue({ data: '0xresult' }),
		...overrides
	};
}

describe('simulateTransaction', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('simulates a raw call (no abi) and returns success', async () => {
		const client = createMockClient();
		mockedCreateClient.mockReturnValue(client as any);

		const result = await simulateTransaction(
			{ to: '0xcontract', data: '0xcalldata' },
			'https://rpc.test',
			'base'
		);

		expect(result.success).toBe(true);
		expect(result.returnData).toBe('0xresult');
		expect(result.gasUsed).toBe('21000');
		expect(client.call).toHaveBeenCalled();
		expect(client.estimateGas).toHaveBeenCalled();
	});

	it('simulates a typed contract call (with abi)', async () => {
		const client = createMockClient();
		mockedCreateClient.mockReturnValue(client as any);

		const result = await simulateTransaction(
			{
				to: '0xcontract',
				abi: [{ name: 'approve', type: 'function' }],
				functionName: 'approve',
				args: ['0xspender', '100']
			},
			'https://rpc.test',
			'base'
		);

		expect(result.success).toBe(true);
		expect(result.decoded).toBe('ok');
		expect(client.simulateContract).toHaveBeenCalled();
	});

	it('returns error result on call failure', async () => {
		const client = createMockClient({
			call: vi.fn().mockRejectedValue(new Error('execution reverted'))
		});
		mockedCreateClient.mockReturnValue(client as any);

		const result = await simulateTransaction(
			{ to: '0xcontract', data: '0xbad' },
			'https://rpc.test',
			'base'
		);

		expect(result.success).toBe(false);
		expect(result.returnData).toBe('execution reverted');
		expect(result.gasUsed).toBe('0');
	});

	it('retries without account on RPC parameter limit error', async () => {
		const client = createMockClient({
			call: vi.fn()
				.mockRejectedValueOnce(new Error('payload too large'))
				.mockResolvedValue({ data: '0xretry' }),
			estimateGas: vi.fn()
				.mockResolvedValue(30000n)
		});
		mockedCreateClient.mockReturnValue(client as any);

		const result = await simulateTransaction(
			{ to: '0xcontract', data: '0xdata', from: '0xsender' as any },
			'https://rpc.test',
			'base'
		);

		expect(result.success).toBe(true);
		expect(result.returnData).toBe('0xretry');
		// First call with account, second without
		expect(client.call).toHaveBeenCalledTimes(2);
	});

	it('passes value as BigInt', async () => {
		const client = createMockClient();
		mockedCreateClient.mockReturnValue(client as any);

		await simulateTransaction(
			{ to: '0xcontract', data: '0xdata', value: '1000000' },
			'https://rpc.test',
			'base'
		);

		const callArgs = client.call.mock.calls[0][0];
		expect(callArgs.value).toBe(1000000n);
	});
});
