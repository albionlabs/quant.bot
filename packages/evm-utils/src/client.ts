import { createPublicClient, http, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
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

export type { Address };
