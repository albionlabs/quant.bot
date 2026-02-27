import { createBaseWalletClient, createBasePublicClient, getSessionKey } from '@quant-bot/evm-utils';
import type { TxExecuteRequest, TxExecuteResponse, Address, Hex } from '@quant-bot/shared-types';

export async function executeTransaction(
	request: TxExecuteRequest,
	rpcUrl: string,
	chainName: string
): Promise<TxExecuteResponse> {
	const sessionKey = getSessionKey(request.sessionKeyId);
	if (!sessionKey) {
		throw new Error(`Invalid or expired session key: ${request.sessionKeyId}`);
	}

	if (sessionKey.userId !== request.userId) {
		throw new Error('Session key does not belong to this user');
	}

	// In production, this would use the session key's private key from a secure store.
	// For now, we use an environment variable as a placeholder.
	const signerKey = process.env.EXECUTOR_PRIVATE_KEY;
	if (!signerKey) {
		throw new Error('EXECUTOR_PRIVATE_KEY not configured');
	}

	const walletClient = createBaseWalletClient(signerKey as `0x${string}`, rpcUrl, chainName);
	const publicClient = createBasePublicClient(rpcUrl, chainName);

	const hash = await walletClient.sendTransaction({
		to: request.to as Address,
		data: request.data as Hex,
		value: request.value ? BigInt(request.value) : undefined
	});

	const receipt = await publicClient.waitForTransactionReceipt({ hash });

	return {
		txHash: receipt.transactionHash,
		blockNumber: Number(receipt.blockNumber),
		status: receipt.status
	};
}
