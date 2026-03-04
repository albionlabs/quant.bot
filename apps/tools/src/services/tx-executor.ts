import { createBasePublicClient } from '@quant-bot/evm-utils';
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
	const credentials = await fetchDelegationCredentials(
		userId,
		config.delegationServiceUrl,
		config.internalSecret
	);

	const client = createDelegatedEvmWalletClient({
		environmentId: config.dynamicEnvironmentId,
		apiKey: config.dynamicSigningKey
	});

	const transaction = {
		to: request.to as Address,
		data: request.data as Hex,
		value: request.value ? BigInt(request.value) : undefined
	};

	// keyShare is stored as a serialized ServerKeyShare object
	const keyShare = JSON.parse(credentials.keyShare);

	const signedTx = await delegatedSignTransaction(client, {
		walletId: credentials.walletId,
		walletApiKey: credentials.walletApiKey,
		keyShare,
		transaction
	});

	const publicClient = createBasePublicClient(config.rpcUrl, config.chainName);
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
