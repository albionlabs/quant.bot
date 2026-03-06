import { createBasePublicClient } from '@quant-bot/evm-utils';
import type { EvmSimulateRequest, EvmSimulateResponse } from '@quant-bot/shared-types';
import type { Address, Hex } from '@quant-bot/shared-types';

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRpcParameterLimitError(message: string): boolean {
	return (
		/(rpc|json-rpc).*(parameter|param).*(limit|too many)/i.test(message) ||
		/(parameter|param).*(limit|too many)/i.test(message) ||
		/payload too large/i.test(message) ||
		/request entity too large/i.test(message)
	);
}

async function withAccountFallback<T>(
	label: string,
	from: Address | undefined,
	run: (account: Address | undefined) => Promise<T>
): Promise<T> {
	try {
		return await run(from);
	} catch (error) {
		const message = errorMessage(error);
		if (from && isRpcParameterLimitError(message)) {
			console.warn(
				`[evm-simulator] ${label} failed with account due provider parameter limit; retrying without account`,
				{ message, from }
			);
			return run(undefined);
		}
		throw error;
	}
}

export async function simulateTransaction(
	request: EvmSimulateRequest,
	rpcUrl: string,
	chainName: string
): Promise<EvmSimulateResponse> {
	const client = createBasePublicClient(rpcUrl, chainName);

	const from = request.from as Address | undefined;

	try {
		if (request.abi && request.functionName) {
			const result = await withAccountFallback('simulateContract', from, (account) =>
				client.simulateContract({
					account,
					address: request.to as Address,
					abi: request.abi as any,
					functionName: request.functionName as any,
					args: (request.args ?? []) as any,
					value: request.value ? BigInt(request.value) : undefined
				} as any)
			);

			// For typed simulations, estimate gas using the same calldata viem encoded for the call.
			const simulatedData = (result as { request?: { data?: Hex } }).request?.data;
			const gasEstimate = await withAccountFallback('estimateGas', from, (account) =>
				client.estimateGas({
					account,
					to: request.to as Address,
					data: simulatedData ?? (request.data as Hex | undefined),
					value: request.value ? BigInt(request.value) : undefined
				})
			);

			return {
				success: true,
				returnData: JSON.stringify(result.result),
				gasUsed: gasEstimate.toString(),
				decoded: result.result
			};
		}

		const callResult = await withAccountFallback('call', from, (account) =>
			client.call({
				account,
				to: request.to as Address,
				data: request.data as Hex | undefined,
				value: request.value ? BigInt(request.value) : undefined
			})
		);

		const gasEstimate = await withAccountFallback('estimateGas', from, (account) =>
			client.estimateGas({
				account,
				to: request.to as Address,
				data: request.data as Hex | undefined,
				value: request.value ? BigInt(request.value) : undefined
			})
		);

		return {
			success: true,
			returnData: callResult.data ?? '0x',
			gasUsed: gasEstimate.toString()
		};
	} catch (error) {
		const message = errorMessage(error);
		return {
			success: false,
			returnData: message,
			gasUsed: '0'
		};
	}
}
