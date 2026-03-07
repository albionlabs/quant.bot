import { getChain } from '@quant-bot/evm-utils';
import type { FastifyInstance } from 'fastify';
import type {
	StageSigningRequest,
	StageSigningResponse,
	TransactionSimulation,
	SigningCompleteResponse
} from '@quant-bot/shared-types';
import { resolveUserIdFromExecutionToken } from '../services/execution-token.js';
import { simulateTransaction } from '../services/evm-simulator.js';
import {
	createBundle,
	getBundle,
	isBundleCompleted,
	markCompleted
} from '../services/signing-store.js';
import { fetchOwnerOrders } from '../services/owner-orders.js';
import { RAINDEX_BASE_URL, RAINDEX_ORDERBOOK_ADDRESS } from '../constants.js';
import type { ToolsConfig } from '../config.js';

function formatGas(gasUsed: string): string {
	const gas = parseInt(gasUsed, 10);
	if (gas >= 1_000_000) return `~${(gas / 1_000_000).toFixed(1)}M gas`;
	if (gas >= 1_000) return `~${Math.round(gas / 1_000)}k gas`;
	return `~${gas} gas`;
}

function buildSummary(simulations: TransactionSimulation[]): string {
	const parts = simulations.map(
		(s, i) =>
			`[${i + 1}] ${s.label} (${s.success ? `ok, ${formatGas(s.gasUsed)}` : `failed: ${s.error ?? 'unknown'}`})`
	);
	return `${simulations.length} transaction${simulations.length === 1 ? '' : 's'} staged: ${parts.join(' ')}`;
}

function checkInternalSecret(request: { headers: Record<string, string | string[] | undefined> }, config: ToolsConfig): boolean {
	const secret = request.headers['x-internal-secret'] as string | undefined;
	return !!secret && secret === config.internalSecret;
}

export async function signingRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: StageSigningRequest }>('/api/evm/stage-signing', async (request, reply) => {
		const { executionToken, transactions, metadata } = request.body;

		if (!executionToken || typeof executionToken !== 'string') {
			return reply.status(400).send({ error: 'executionToken is required' });
		}
		if (!Array.isArray(transactions) || transactions.length === 0) {
			return reply.status(400).send({ error: 'transactions array is required and must not be empty' });
		}

		let userId: string;
		try {
			userId = await resolveUserIdFromExecutionToken(executionToken, config.internalSecret);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid execution token';
			return reply.status(401).send({ error: message });
		}

		// Validate each transaction
		for (let i = 0; i < transactions.length; i++) {
			const tx = transactions[i];
			if (!tx.to || !/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
				return reply.status(400).send({ error: `Transaction ${i}: invalid "to" address` });
			}
			if (!tx.data || !tx.data.startsWith('0x')) {
				return reply.status(400).send({ error: `Transaction ${i}: invalid "data" field` });
			}
			if (!tx.label || typeof tx.label !== 'string') {
				return reply.status(400).send({ error: `Transaction ${i}: label is required` });
			}
		}

		const chain = getChain(config.chainName);

		// Simulate all transactions
		const simulations: TransactionSimulation[] = [];
		for (let i = 0; i < transactions.length; i++) {
			const tx = transactions[i];
			const result = await simulateTransaction(
				{ to: tx.to, data: tx.data, value: tx.value, from: userId },
				config.rpcUrl,
				config.chainName
			);
			simulations.push({
				index: i,
				label: tx.label,
				success: result.success,
				gasUsed: result.gasUsed,
				error: result.success ? undefined : result.returnData
			});
		}

		// Store bundle (even if simulations fail — agent decides whether to proceed)
		const enrichedTxs = transactions.map((tx, i) => ({
			...tx,
			simulation: simulations[i]
		}));

		const signingId = createBundle(userId, chain.id, enrichedTxs, metadata);
		const allSimulationsSucceeded = simulations.every((s) => s.success);

		const response: StageSigningResponse = {
			signingId,
			summary: buildSummary(simulations),
			simulations,
			allSimulationsSucceeded
		};

		app.log.info(
			{ signingId, userId, txCount: transactions.length, allSimulationsSucceeded },
			'/api/evm/stage-signing created bundle'
		);

		return response;
	});

	app.get<{ Params: { id: string } }>('/api/evm/signing/:id', async (request, reply) => {
		if (!checkInternalSecret(request, config)) {
			return reply.status(401).send({ error: 'Unauthorized' });
		}

		const { id } = request.params;

		if (isBundleCompleted(id)) {
			return reply.status(410).send({ error: 'Bundle already completed' });
		}

		const bundle = getBundle(id);
		if (!bundle) {
			return reply.status(404).send({ error: 'Bundle not found or expired' });
		}

		const { userId: _owner, ...bundleData } = bundle;
		return bundleData;
	});

	app.post<{ Params: { id: string }; Body: { userId: string; txHashes: string[] } }>(
		'/api/evm/signing/:id/complete',
		async (request, reply) => {
			if (!checkInternalSecret(request, config)) {
				return reply.status(401).send({ error: 'Unauthorized' });
			}

			const { id } = request.params;
			const { userId, txHashes } = request.body;

			if (!userId || typeof userId !== 'string') {
				return reply.status(400).send({ error: 'userId is required' });
			}
			if (!Array.isArray(txHashes) || txHashes.length === 0) {
				return reply.status(400).send({ error: 'txHashes array is required' });
			}

			if (isBundleCompleted(id)) {
				return reply.status(410).send({ error: 'Bundle already completed' });
			}

			const bundle = getBundle(id);
			if (!bundle) {
				return reply.status(404).send({ error: 'Bundle not found or expired' });
			}

			if (bundle.userId !== userId) {
				return reply.status(403).send({ error: 'User does not own this bundle' });
			}

			markCompleted(id, txHashes);

			const response: SigningCompleteResponse = {
				success: true,
				message: 'Bundle completed'
			};

			// For strategy deployments, resolve order hash + Raindex link
			if (bundle.metadata?.operationType === 'strategy_deployment') {
				try {
					const orders = await fetchOwnerOrders(userId, 5);
					if (orders.length > 0) {
						const latestOrder = orders[0];
						response.orderHash = latestOrder.orderHash;
						response.raindexUrl = `${RAINDEX_BASE_URL}/orders/${bundle.chainId}-${RAINDEX_ORDERBOOK_ADDRESS}-${latestOrder.orderHash}`;
					}
				} catch (error) {
					app.log.warn(
						{ error: error instanceof Error ? error.message : String(error) },
						'Failed to resolve order hash after completion'
					);
				}
			}

			app.log.info({ signingId: id, userId, txHashes }, '/api/evm/signing/:id/complete');

			return response;
		}
	);
}
