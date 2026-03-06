import { get, writable } from 'svelte/store';
import type { TxSignRequestPayload, WalletProvider } from '../types.js';

export const walletProvider = writable<WalletProvider | null>(null);

export function setWalletProvider(provider: WalletProvider | null): void {
	walletProvider.set(provider);
}

export function clearWalletProvider(): void {
	walletProvider.set(null);
}

function isAddress(value: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeHexData(data: string): string {
	if (!data.startsWith('0x')) {
		throw new Error('Transaction data must be a hex string');
	}
	if ((data.length - 2) % 2 !== 0) {
		throw new Error('Transaction data has invalid hex length');
	}
	return data;
}

function toHexFromWei(value: string): `0x${string}` {
	const wei = value.trim() === '' ? 0n : BigInt(value);
	return `0x${wei.toString(16)}`;
}

function toHexChainId(chainId: number): `0x${string}` {
	if (!Number.isInteger(chainId) || chainId <= 0) {
		throw new Error('Invalid chainId for signing request');
	}
	return `0x${chainId.toString(16)}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyMinedReceipt(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.blockNumber === 'string' && candidate.blockNumber !== '0x0';
}

export async function signTransactionRequest(request: TxSignRequestPayload): Promise<string> {
	const provider = get(walletProvider);
	if (!provider) {
		throw new Error('Wallet provider is not available. Please reconnect Dynamic.');
	}

	if (request.kind !== 'evm_send_transaction') {
		throw new Error(`Unsupported sign request kind: ${request.kind}`);
	}
	if (!isAddress(request.from)) {
		throw new Error('Invalid signer address in sign request');
	}
	if (!isAddress(request.to)) {
		throw new Error('Invalid target address in sign request');
	}

	const txRequest = {
		from: request.from,
		to: request.to,
		data: normalizeHexData(request.data),
		value: toHexFromWei(request.value ?? '0'),
		chainId: toHexChainId(request.chainId)
	};

	const result = await provider.request({
		method: 'eth_sendTransaction',
		params: [txRequest]
	});

	if (typeof result !== 'string' || !result.startsWith('0x')) {
		throw new Error('Wallet provider returned an invalid transaction hash');
	}

	return result;
}

export async function waitForTransactionConfirmation(
	txHash: string,
	{ timeoutMs = 180_000, pollIntervalMs = 3_000 }: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<boolean> {
	const provider = get(walletProvider);
	if (!provider) {
		throw new Error('Wallet provider is not available. Please reconnect Dynamic.');
	}
	if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
		throw new Error('Invalid transaction hash');
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const receipt = await provider.request({
			method: 'eth_getTransactionReceipt',
			params: [txHash]
		});

		if (isLikelyMinedReceipt(receipt)) {
			return true;
		}

		await sleep(pollIntervalMs);
	}

	return false;
}
