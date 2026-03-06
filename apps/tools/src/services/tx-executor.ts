import { createBasePublicClient, getChain } from '@quant-bot/evm-utils';
import type { TxExecuteResponse, Address, Hex } from '@quant-bot/shared-types';
import {
	createDelegatedEvmWalletClient,
	delegatedSignTransaction
} from '@dynamic-labs-wallet/node-evm';
import { fetchDelegationCredentials } from './delegation-client.js';
import type { ToolsConfig } from '../config.js';

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

	const keyShare = JSON.parse(credentials.keyShare);

	console.log('[tx-executor] calling delegatedSignTransaction:', {
		walletId: credentials.walletId,
		hasWalletApiKey: !!credentials.walletApiKey,
		keyShareKeys: Object.keys(keyShare),
		transactionChainId: transaction.chainId
	});

	const signedTx = await delegatedSignTransaction(client, {
		walletId: credentials.walletId,
		walletApiKey: credentials.walletApiKey,
		keyShare,
		transaction
	});

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
