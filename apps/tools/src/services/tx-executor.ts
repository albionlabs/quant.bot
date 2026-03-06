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

	// === Phase 1: Key share shape audit ===
	console.log('[tx-executor] KEY SHARE SHAPE AUDIT:', {
		topLevelKeys: Object.keys(keyShare),
		topLevelTypes: Object.fromEntries(
			Object.entries(keyShare).map(([k, v]) => [k, typeof v])
		),
		pubkeyType: typeof keyShare?.pubkey,
		pubkeyKeys: keyShare?.pubkey ? Object.keys(keyShare.pubkey) : 'N/A',
		pubkeyPubkeyExists: 'pubkey' in (keyShare?.pubkey ?? {}),
		pubkeyPubkeyConstructor: keyShare?.pubkey?.pubkey?.constructor?.name,
		pubkeyPubkeyIsUint8Array: keyShare?.pubkey?.pubkey instanceof Uint8Array,
		pubkeyPubkeyIsBuffer: Buffer.isBuffer(keyShare?.pubkey?.pubkey),
		pubkeyPubkeyIsArray: Array.isArray(keyShare?.pubkey?.pubkey),
		pubkeyPubkeyType: typeof keyShare?.pubkey?.pubkey,
		pubkeyPubkeyLength: keyShare?.pubkey?.pubkey?.length
			?? (keyShare?.pubkey?.pubkey ? Object.keys(keyShare.pubkey.pubkey).length : 'N/A'),
		pubkeyPubkeyFirst3Keys: (() => {
			const inner = keyShare?.pubkey?.pubkey;
			if (inner && typeof inner === 'object' && !(inner instanceof Uint8Array)) {
				return Object.keys(inner).slice(0, 3);
			}
			return 'not-a-plain-object';
		})(),
		secretShareType: typeof keyShare?.secretShare,
		secretShareLength: keyShare?.secretShare?.length,
		secretSharePrefix: typeof keyShare?.secretShare === 'string'
			? keyShare.secretShare.substring(0, 6) + '...' : 'NOT_STRING',
		secretShareHasLeadingWhitespace: typeof keyShare?.secretShare === 'string'
			&& keyShare.secretShare !== keyShare.secretShare.trimStart(),
		secretShareHasTrailingWhitespace: typeof keyShare?.secretShare === 'string'
			&& keyShare.secretShare !== keyShare.secretShare.trimEnd(),
		secretShareHasNewlines: typeof keyShare?.secretShare === 'string'
			&& /[\r\n]/.test(keyShare.secretShare),
	});

	console.log('[tx-executor] CREDENTIAL SHAPE CHECK:', {
		walletIdOk: typeof credentials.walletId === 'string' && credentials.walletId.length > 10,
		walletApiKeyOk: typeof credentials.walletApiKey === 'string' && credentials.walletApiKey.startsWith('dyn_'),
		secretShareType: typeof keyShare?.secretShare,
		secretShareLen: keyShare?.secretShare?.length,
		pubkeyOuterType: typeof keyShare?.pubkey,
		pubkeyInnerIsUint8Array: keyShare?.pubkey?.pubkey instanceof Uint8Array,
		pubkeyInnerCtor: keyShare?.pubkey?.pubkey?.constructor?.name,
		pubkeyInnerLen: keyShare?.pubkey?.pubkey?.length,
	});

	// === Phase 4: Credential fingerprint ===
	const keyShareHash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(credentials.keyShare)
	).then(buf => Buffer.from(buf).toString('hex').substring(0, 16));

	console.log('[tx-executor] CREDENTIAL FINGERPRINT:', {
		walletId: credentials.walletId,
		walletAddress: credentials.walletAddress,
		chainId: credentials.chainId,
		keyShareHash,
		walletApiKeyPrefix: credentials.walletApiKey.substring(0, 8) + '...',
		environmentId: config.dynamicEnvironmentId,
		retrievedAt: new Date().toISOString(),
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
