import { createBasePublicClient } from '@quant-bot/evm-utils';
import type { EvmSimulateRequest, EvmSimulateResponse } from '@quant-bot/shared-types';
import type { Address, Hex } from '@quant-bot/shared-types';

export async function simulateTransaction(
	request: EvmSimulateRequest,
	rpcUrl: string,
	chainName: string
): Promise<EvmSimulateResponse> {
	const client = createBasePublicClient(rpcUrl, chainName);

	try {
		if (request.abi && request.functionName) {
			const result = await client.simulateContract({
				address: request.to as Address,
				abi: request.abi,
				functionName: request.functionName,
				args: request.args ?? [],
				value: request.value ? BigInt(request.value) : undefined
			});

			const gasEstimate = await client.estimateGas({
				to: request.to as Address,
				data: request.data as Hex | undefined,
				value: request.value ? BigInt(request.value) : undefined
			});

			return {
				success: true,
				returnData: JSON.stringify(result.result),
				gasUsed: gasEstimate.toString(),
				decoded: result.result
			};
		}

		const callResult = await client.call({
			to: request.to as Address,
			data: request.data as Hex | undefined,
			value: request.value ? BigInt(request.value) : undefined
		});

		const gasEstimate = await client.estimateGas({
			to: request.to as Address,
			data: request.data as Hex | undefined,
			value: request.value ? BigInt(request.value) : undefined
		});

		return {
			success: true,
			returnData: callResult.data ?? '0x',
			gasUsed: gasEstimate.toString()
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			returnData: message,
			gasUsed: '0'
		};
	}
}
