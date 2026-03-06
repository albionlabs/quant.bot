import { createHash } from 'node:crypto';
import { createBasePublicClient, getChain } from '@quant-bot/evm-utils';
import type { TxExecuteResponse, Address, Hex } from '@quant-bot/shared-types';
import {
	createDelegatedEvmWalletClient,
	delegatedSignMessage,
	delegatedSignTransaction
} from '@dynamic-labs-wallet/node-evm';
import { fetchDelegationCredentials } from './delegation-client.js';
import type { ToolsConfig } from '../config.js';

function fp(value: unknown): string {
	if (value === undefined || value === null) return 'null';
	const str = typeof value === 'string' ? value : JSON.stringify(value);
	return createHash('sha256').update(str).digest('hex').substring(0, 12);
}

function fpBytes(val: unknown): string {
	if (val instanceof Uint8Array) return fp(JSON.stringify(Array.from(val)));
	if (val && typeof val === 'object' && !Array.isArray(val)) {
		return fp(JSON.stringify(Array.from(Object.values(val as Record<string, number>))));
	}
	return fp(val);
}

function describeKeyShare(ks: unknown): Record<string, unknown> {
	if (!ks || typeof ks !== 'object') {
		return { valid: false, reason: 'not an object', type: typeof ks };
	}
	const obj = ks as Record<string, unknown>;
	const topKeys = Object.keys(obj).sort();
	const pubkey = obj.pubkey as Record<string, unknown> | undefined;
	const inner = pubkey?.pubkey;
	const secretShare = obj.secretShare;

	return {
		topKeys,
		topKeysOk: topKeys.length === 2 && topKeys[0] === 'pubkey' && topKeys[1] === 'secretShare',
		innerCtorName: (inner as any)?.constructor?.name ?? null,
		innerIsUint8Array: inner instanceof Uint8Array,
		innerLength: inner instanceof Uint8Array
			? inner.length
			: (inner && typeof inner === 'object' ? Object.keys(inner).length : null),
		secretShareType: typeof secretShare,
		secretShareLen: typeof secretShare === 'string' ? secretShare.length : null,
		secretShareHasWhitespace: typeof secretShare === 'string'
			&& secretShare !== secretShare.trim()
	};
}

const STANDARD_ERROR_KEYS = new Set(['name', 'message', 'stack', 'code', 'type', 'statusCode', 'status', 'cause']);

function summarizeError(err: unknown): Record<string, unknown> {
	if (!err || typeof err !== 'object') {
		return { type: typeof err, value: String(err) };
	}
	const e = err as Record<string, unknown>;
	const result: Record<string, unknown> = {
		name: e.name,
		message: e.message,
		code: e.code,
		type: e.type,
		statusCode: e.statusCode,
		status: e.status,
		enumerableKeys: Object.keys(e).sort(),
		stackFirst300: typeof e.stack === 'string'
			? (e.stack as string).substring(0, 300) : null
	};

	if (e.cause && typeof e.cause === 'object') {
		const cause = e.cause as Record<string, unknown>;
		result.causeName = cause.name;
		result.causeMessage = cause.message;
		result.causeCode = cause.code;
		result.causeEnumerableKeys = Object.keys(cause).sort();
	} else if (e.cause !== undefined) {
		result.causeRaw = String(e.cause);
	}

	for (const key of Object.keys(e)) {
		if (!STANDARD_ERROR_KEYS.has(key)) {
			result[`extra_${key}`] = typeof e[key] === 'object'
				? JSON.stringify(e[key]).substring(0, 200) : String(e[key]);
		}
	}

	return result;
}

function classifyCeremonyFailure(elapsedMs: number, err: unknown): string {
	const summary = summarizeError(err);
	const message = String(summary.message ?? '').toLowerCase();
	const causeMessage = String(summary.causeMessage ?? '').toLowerCase();
	const combined = `${message} ${causeMessage}`;

	if (elapsedMs < 7_500) {
		return 'did_not_start_or_immediate_credential_rejection';
	}

	if (
		elapsedMs >= 55_000
		&& elapsedMs <= 75_000
		&& (
			combined.includes('websocket')
			|| combined.includes('socket')
			|| combined.includes('relay')
			|| combined.includes('timeout')
			|| combined.includes('closed')
			|| combined.includes('econnreset')
		)
	) {
		return 'possible_relay_or_websocket_cut_near_60s';
	}

	if (elapsedMs >= 60_000) {
		return 'started_then_stalled_mid_flight';
	}

	return 'unknown_ceremony_failure_window';
}

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

export async function testSignMessage(
	userId: string,
	config: ToolsConfig
): Promise<{ signature: string; attemptId: string; elapsedMs: number }> {
	const attemptId = crypto.randomUUID().slice(0, 8);
	const wallStart = performance.now();

	console.log(`[sign:${attemptId}] WALL_START for userId:`, userId);

	const credentials = await fetchDelegationCredentials(
		userId,
		config.delegationServiceUrl,
		config.internalSecret,
		attemptId
	);
	const fetchDone = performance.now();

	const rawKeyShare = JSON.parse(credentials.keyShare);
	const keyShare = restoreKeySharePubkey(rawKeyShare);
	const prepareDone = performance.now();

	console.log(`[sign:${attemptId}] PRE_CONSTRUCT:`, {
		...describeKeyShare(keyShare),
		fp_secretShare: fp((keyShare as any).secretShare),
		fp_pubkeyBytes: fpBytes((keyShare as any).pubkey?.pubkey),
		fp_wholeKeyShare: fp(credentials.keyShare),
		fp_walletApiKey: fp(credentials.walletApiKey),
		walletId: credentials.walletId,
		walletAddress: credentials.walletAddress,
		environmentId: config.dynamicEnvironmentId,
		signingKeyPrefix: config.dynamicSigningKey?.substring(0, 8)
	});

	const client = createDelegatedEvmWalletClient({
		environmentId: config.dynamicEnvironmentId,
		apiKey: config.dynamicSigningKey,
		debug: true
	});

	const message = 'test';
	const t0 = performance.now();
	console.log(`[sign:${attemptId}] CALL_START:`, {
		fn: 'delegatedSignMessage',
		walletId: credentials.walletId,
		message,
		t0Iso: new Date().toISOString()
	});

	const onError = (error: Error) => {
		const elapsed = Math.round(performance.now() - t0);
		console.error(`[sign:${attemptId}] ON_ERROR at +${elapsed}ms:`,
			summarizeError(error));
	};

	let signature: string;
	try {
		signature = await delegatedSignMessage(client, {
			walletId: credentials.walletId,
			walletApiKey: credentials.walletApiKey,
			keyShare: keyShare as any,
			message,
			onError
		});

		const t1 = performance.now();
		console.log(`[sign:${attemptId}] CALL_END:`, {
			outcome: 'success',
			elapsedMs: Math.round(t1 - t0),
			endIso: new Date().toISOString(),
			resultPrefix: signature.substring(0, 10) + '...'
		});

		console.log(`[sign:${attemptId}] TIMING:`, {
			credentialFetchMs: Math.round(fetchDone - wallStart),
			prepareMs: Math.round(prepareDone - fetchDone),
			sdkCallMs: Math.round(t1 - t0),
			totalMs: Math.round(t1 - wallStart),
			outcome: 'success'
		});

		return { signature, attemptId, elapsedMs: Math.round(t1 - wallStart) };
	} catch (err) {
		const t1 = performance.now();
		console.error(`[sign:${attemptId}] CATCH at +${Math.round(t1 - t0)}ms:`,
			summarizeError(err));

		console.log(`[sign:${attemptId}] CALL_END:`, {
			outcome: 'failure',
			elapsedMs: Math.round(t1 - t0),
			endIso: new Date().toISOString()
		});

		console.log(`[sign:${attemptId}] TIMING:`, {
			credentialFetchMs: Math.round(fetchDone - wallStart),
			prepareMs: Math.round(prepareDone - fetchDone),
			sdkCallMs: Math.round(t1 - t0),
			totalMs: Math.round(t1 - wallStart),
			outcome: 'failure'
		});

		throw err;
	}
}

export async function executeTransaction(
	request: { to: string; data: string; value?: string },
	userId: string,
	config: ToolsConfig
): Promise<TxExecuteResponse> {
	const attemptId = crypto.randomUUID().slice(0, 8);
	const wallStart = performance.now();
	console.log(`[sign:${attemptId}] starting executeTransaction for userId:`, userId);

	const credentials = await fetchDelegationCredentials(
		userId,
		config.delegationServiceUrl,
		config.internalSecret,
		attemptId
	);
	const fetchDone = performance.now();

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
	const prepareDone = performance.now();

	const client = createDelegatedEvmWalletClient({
		environmentId: config.dynamicEnvironmentId,
		apiKey: config.dynamicSigningKey,
		debug: true
	});

	const rawKeyShare = JSON.parse(credentials.keyShare);
	const keyShare = restoreKeySharePubkey(rawKeyShare);

	console.log(`[sign:${attemptId}] PRE_CONSTRUCT:`, {
		...describeKeyShare(keyShare),
		fp_wholeKeyShare: fp(credentials.keyShare),
		fp_walletApiKey: fp(credentials.walletApiKey),
		walletId: credentials.walletId
	});

	const t0 = performance.now();
	console.log(`[sign:${attemptId}] CALL_START:`, {
		fn: 'delegatedSignTransaction',
		walletId: credentials.walletId,
		t0Iso: new Date().toISOString()
	});

	const progressInterval = setInterval(() => {
		const elapsed = Math.round(performance.now() - t0);
		const phase = elapsed >= 55_000 && elapsed <= 75_000
			? 'relay_cutoff_window'
			: 'in_progress';
		console.log(`[sign:${attemptId}] CALL_IN_FLIGHT:`, {
			elapsedMs: elapsed,
			phase
		});
	}, 10_000);

	let signedTx: unknown;
	try {
		signedTx = await delegatedSignTransaction(client, {
			walletId: credentials.walletId,
			walletApiKey: credentials.walletApiKey,
			keyShare: keyShare as any,
			transaction
		});
		console.log(`[sign:${attemptId}] CALL_END:`, {
			outcome: 'success',
			elapsedMs: Math.round(performance.now() - t0)
		});
	} catch (err) {
		const elapsed = Math.round(performance.now() - t0);
		const failureClass = classifyCeremonyFailure(elapsed, err);
		console.error(`[sign:${attemptId}] CATCH at +${elapsed}ms:`,
			summarizeError(err));
		console.log(`[sign:${attemptId}] CALL_END:`, {
			outcome: 'failure',
			elapsedMs: elapsed,
			failureClass
		});
		throw err;
	} finally {
		clearInterval(progressInterval);
	}

	const broadcastStart = performance.now();
	const hash = await publicClient.sendRawTransaction({
		serializedTransaction: signedTx as Hex
	});

	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	const done = performance.now();

	console.log(`[sign:${attemptId}] TIMING:`, {
		credentialFetchMs: Math.round(fetchDone - wallStart),
		prepareTxMs: Math.round(prepareDone - fetchDone),
		ceremonyMs: Math.round(broadcastStart - t0),
		broadcastAndReceiptMs: Math.round(done - broadcastStart),
		totalMs: Math.round(done - wallStart),
		outcome: 'success'
	});

	return {
		txHash: receipt.transactionHash,
		blockNumber: Number(receipt.blockNumber),
		status: receipt.status
	};
}
