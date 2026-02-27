import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from '@quant-bot/shared-types';

const CHAIN_MAP: Record<string, Chain> = {
	base,
	'base-sepolia': baseSepolia
};

export function getChain(name: string): Chain {
	const chain = CHAIN_MAP[name];
	if (!chain) throw new Error(`Unknown chain: ${name}`);
	return chain;
}

export function createBasePublicClient(rpcUrl?: string, chainName = 'base') {
	const chain = getChain(chainName);
	return createPublicClient({
		chain,
		transport: http(rpcUrl)
	});
}

export function createBaseWalletClient(privateKey: `0x${string}`, rpcUrl?: string, chainName = 'base') {
	const chain = getChain(chainName);
	const account = privateKeyToAccount(privateKey);
	return createWalletClient({
		chain,
		account,
		transport: http(rpcUrl)
	});
}

export type { Address };
