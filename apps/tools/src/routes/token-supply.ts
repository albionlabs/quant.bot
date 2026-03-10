import type { FastifyInstance } from 'fastify';
import { createBasePublicClient } from '@quant-bot/evm-utils';
import type { ToolsConfig } from '../config.js';
import { getCached } from '../services/metadata-cache.js';
import { fetchRawTokenMetadata } from '../services/token-metadata.js';
import { extractFields } from '../services/metadata-cache.js';

const ERC20_ABI = [
	{
		type: 'function',
		name: 'totalSupply',
		inputs: [],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		type: 'function',
		name: 'decimals',
		inputs: [],
		outputs: [{ type: 'uint8' }],
		stateMutability: 'view'
	}
] as const;

function formatUnits(value: bigint, decimals: number): string {
	const s = value.toString().padStart(decimals + 1, '0');
	const intPart = s.slice(0, s.length - decimals) || '0';
	const fracPart = s.slice(s.length - decimals);
	if (decimals === 0) return intPart;
	const trimmed = fracPart.replace(/0+$/, '');
	return trimmed ? `${intPart}.${trimmed}` : intPart;
}

const METADATA_SUPPLY_PATHS = ['totalSupply', 'token-supply', 'tokenSupply', 'supply'];

async function supplyFromMetadata(address: string): Promise<string | null> {
	let data = getCached(address);
	if (!data) {
		data = await fetchRawTokenMetadata(address);
	}
	if (!data) return null;

	const fields = extractFields(data, METADATA_SUPPLY_PATHS);
	for (const path of METADATA_SUPPLY_PATHS) {
		const val = fields[path];
		if (val !== null && val !== undefined) {
			return String(val);
		}
	}
	return null;
}

export async function tokenSupplyRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.get<{ Params: { address: string } }>(
		'/api/tokens/:address/supply',
		async (request, reply) => {
			const { address } = request.params;

			if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return reply.status(400).send({ error: 'Invalid token address' });
			}

			try {
				const client = createBasePublicClient(config.rpcUrl, config.chainName);

				const [totalSupply, decimals] = await Promise.all([
					client.readContract({
						address: address as `0x${string}`,
						abi: ERC20_ABI,
						functionName: 'totalSupply'
					}),
					client.readContract({
						address: address as `0x${string}`,
						abi: ERC20_ABI,
						functionName: 'decimals'
					})
				]);

				return {
					address,
					source: 'rpc',
					totalSupply: totalSupply.toString(),
					decimals,
					formatted: formatUnits(totalSupply, decimals)
				};
			} catch (rpcError) {
				console.warn(
					'[token-supply] RPC failed, falling back to metadata',
					rpcError instanceof Error ? rpcError.message : rpcError
				);

				try {
					const metaSupply = await supplyFromMetadata(address);
					if (metaSupply) {
						return {
							address,
							source: 'metadata',
							formatted: metaSupply
						};
					}
				} catch (metaError) {
					console.warn(
						'[token-supply] Metadata fallback also failed',
						metaError instanceof Error ? metaError.message : metaError
					);
				}

				const message = rpcError instanceof Error ? rpcError.message : 'Failed to fetch token supply';
				return reply.status(500).send({ error: message });
			}
		}
	);
}
