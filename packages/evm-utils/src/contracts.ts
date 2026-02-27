import type { Address } from '@quant-bot/shared-types';

export const CONTRACTS = {
	base: {
		orderbook: '0x0000000000000000000000000000000000000000' as Address
	},
	'base-sepolia': {
		orderbook: '0x0000000000000000000000000000000000000000' as Address
	}
} as const;

export const ORDERBOOK_ABI = [
	{
		type: 'function',
		name: 'addOrder',
		inputs: [
			{
				name: 'order',
				type: 'tuple',
				components: [
					{ name: 'owner', type: 'address' },
					{ name: 'nonce', type: 'bytes32' },
					{ name: 'evaluable', type: 'tuple', components: [
						{ name: 'interpreter', type: 'address' },
						{ name: 'store', type: 'address' },
						{ name: 'bytecode', type: 'bytes' }
					]},
					{ name: 'validInputs', type: 'tuple[]', components: [
						{ name: 'token', type: 'address' },
						{ name: 'decimals', type: 'uint8' },
						{ name: 'vaultId', type: 'uint256' }
					]},
					{ name: 'validOutputs', type: 'tuple[]', components: [
						{ name: 'token', type: 'address' },
						{ name: 'decimals', type: 'uint8' },
						{ name: 'vaultId', type: 'uint256' }
					]}
				]
			}
		],
		outputs: [{ name: 'stateChanged', type: 'bool' }],
		stateMutability: 'nonpayable'
	}
] as const;
