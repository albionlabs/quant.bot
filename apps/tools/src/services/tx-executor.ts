import { createBasePublicClient, getChain } from '@quant-bot/evm-utils';
import type { TxExecuteResponse, Address, Hex } from '@quant-bot/shared-types';
import {
	createDelegatedEvmWalletClient,
	delegatedSignTransaction
} from '@dynamic-labs-wallet/node-evm';
import { fetchDelegationCredentials } from './delegation-client.js';
import type { ToolsConfig } from '../config.js';

/**
 * Reconstructs pubkey.pubkey from a plain object with numeric keys back to
 * Uint8Array. JSON round-trips destroy typed arrays — JSON.parse produces
 * {"0":44,"1":229,...} instead of Uint8Array(64). The Dynamic SDK expects
 * Uint8Array for the MPC ceremony.
 */
function restoreKeySharePubkey(keyShare: Record<string, unknown>): Record<string, unknown> {
	const inner = (keyShare.pubkey as Record<string, unknown>)?.pubkey;
	if (!inner || inner instanceof Uint8Array) return keyShare;

	if (typeof inner === 'object' && !Array.isArray(inner)) {
		const entries = Object.entries(inner as Record<string, number>);
		const bytes = new Uint8Array(entries.length);
		for (const [k, v] of entries) {
			bytes[Number(k)] = v;
		}
		return {
			...keyShare,
			pubkey: { ...(keyShare.pubkey as Record<string, unknown>), pubkey: bytes }
		};
	}

	return keyShare;
}

export async function executeTransaction(
	request: { to: string; data: string; value?: string },
	userId: string,
	config: ToolsConfig
): Promise<TxExecuteResponse> {
	console.log('[tx-executor] starting execution for userId:', userId);

	const credentials = await fetchDelegationCredentials(
		userId,
		config.delegationServiceUrl,
		config.internalSecret
	);

	console.log('[tx-executor] credentials fetched:', {
		walletId: credentials.walletId,
		walletAddress: credentials.walletAddress,
		chainId: credentials.chainId,
		hasWalletApiKey: !!credentials.walletApiKey,
		walletApiKeyLength: credentials.walletApiKey?.length,
		hasKeyShare: !!credentials.keyShare,
		keyShareLength: credentials.keyShare?.length
	});

	const publicClient = createBasePublicClient(config.rpcUrl, config.chainName);
	const chain = getChain(config.chainName);

	const prepared = await publicClient.prepareTransactionRequest({
		account: credentials.walletAddress as Address,
		to: request.to as Address,
		data: request.data as Hex,
		value: request.value ? BigInt(request.value) : 0n,
		chain
	});

	const transaction = {
		chainId: chain.id,
		type: 'eip1559' as const,
		to: request.to as Address,
		data: request.data as Hex,
		value: request.value ? BigInt(request.value) : 0n,
		nonce: prepared.nonce,
		gas: prepared.gas,
		maxFeePerGas: prepared.maxFeePerGas,
		maxPriorityFeePerGas: prepared.maxPriorityFeePerGas
	};

	console.log('[tx-executor] transaction prepared:', {
		chainId: transaction.chainId,
		type: transaction.type,
		to: transaction.to,
		nonce: transaction.nonce,
		gas: transaction.gas?.toString(),
		maxFeePerGas: transaction.maxFeePerGas?.toString(),
		maxPriorityFeePerGas: transaction.maxPriorityFeePerGas?.toString()
	});

	console.log('[tx-executor] creating Dynamic client:', {
		environmentId: config.dynamicEnvironmentId,
		hasSigningKey: !!config.dynamicSigningKey,
		signingKeyPrefix: config.dynamicSigningKey?.substring(0, 8) + '...'
	});

	const client = createDelegatedEvmWalletClient({
		environmentId: config.dynamicEnvironmentId,
		apiKey: config.dynamicSigningKey,
		debug: true
	});

	const rawKeyShare = JSON.parse(credentials.keyShare);
	const keyShare = restoreKeySharePubkey(rawKeyShare);

	console.log('[tx-executor] keyShare pubkey restored:', {
		wasUint8Array: rawKeyShare?.pubkey?.pubkey instanceof Uint8Array,
		isNowUint8Array: (keyShare.pubkey as any)?.pubkey instanceof Uint8Array,
		pubkeyLength: (keyShare.pubkey as any)?.pubkey?.length,
		secretShareLength: (keyShare as any)?.secretShare?.length,
	});

	console.log('[tx-executor] calling delegatedSignTransaction:', {
		walletId: credentials.walletId,
		hasWalletApiKey: !!credentials.walletApiKey,
		keyShareKeys: Object.keys(keyShare),
		transactionChainId: transaction.chainId
	});

	// === Phase 3: MPC ceremony timing ===
	const signingStartMs = Date.now();
	console.log('[tx-executor] MPC ceremony starting at', new Date().toISOString());

	let signedTx: unknown;
	try {
		signedTx = await delegatedSignTransaction(client, {
			walletId: credentials.walletId,
			walletApiKey: credentials.walletApiKey,
			keyShare,
			transaction
		});
		console.log('[tx-executor] MPC ceremony completed in', Date.now() - signingStartMs, 'ms');
	} catch (err) {
		const elapsedMs = Date.now() - signingStartMs;
		console.error('[tx-executor] MPC ceremony FAILED after', elapsedMs, 'ms');
		console.error('[tx-executor] Error details:', {
			name: (err as Error)?.name,
			message: (err as Error)?.message,
			code: (err as any)?.code,
			type: (err as any)?.type,
			wasClean: (err as any)?.wasClean,
			reason: (err as any)?.reason,
			statusCode: (err as any)?.statusCode,
			stackPrefix: (err as Error)?.stack?.substring(0, 500),
		});
		console.error('[tx-executor] Timing analysis:', {
			elapsedMs,
			likelyTimeout: elapsedMs > 58000 && elapsedMs < 65000,
			exactSeconds: Math.round(elapsedMs / 1000),
		});
		throw err;
	}

	const hash = await publicClient.sendRawTransaction({
		serializedTransaction: signedTx as Hex
	});

	const receipt = await publicClient.waitForTransactionReceipt({ hash });

	return {
		txHash: receipt.transactionHash,
		blockNumber: Number(receipt.blockNumber),
		status: receipt.status
	};
}
