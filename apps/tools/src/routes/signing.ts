import { getChain } from '@quant-bot/evm-utils';
import type { FastifyInstance } from 'fastify';
import type {
	StageSigningRequest,
	StageSigningResponse,
	TransactionSimulation,
	SigningCompleteResponse,
	StagedTransaction
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

const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

export class StageSigningError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string
	) {
		super(message);
		this.name = 'StageSigningError';
	}
}

function formatGas(gasUsed: string): string {
	const gas = parseInt(gasUsed, 10);
	if (gas >= 1_000_000) return `~${(gas / 1_000_000).toFixed(1)}M gas`;
	if (gas >= 1_000) return `~${Math.round(gas / 1_000)}k gas`;
	return `~${gas} gas`;
}

function buildSummary(simulations: TransactionSimulation[]): string {
	const parts = simulations.map((s, i) => {
		if (s.status === 'requires_prior_state') {
			return `[${i + 1}] ${s.label} (needs prior tx state: execute approvals first)`;
		}
		if (s.success) {
			return `[${i + 1}] ${s.label} (ok, ${formatGas(s.gasUsed)})`;
		}
		return `[${i + 1}] ${s.label} (failed: ${s.error ?? 'unknown'})`;
	});
	return `${simulations.length} transaction${simulations.length === 1 ? '' : 's'} staged: ${parts.join(' ')}`;
}

function normalizeAddress(value: string): string | null {
	return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : null;
}

function isApprovalTransaction(tx: StagedTransaction): boolean {
	return typeof tx.data === 'string' && tx.data.toLowerCase().startsWith(ERC20_APPROVE_SELECTOR);
}

function parseApprovalSpender(data: string): string | null {
	const normalized = data.toLowerCase();
	if (!normalized.startsWith(ERC20_APPROVE_SELECTOR)) return null;
	const payload = normalized.slice(10);
	if (payload.length < 64) return null;
	const spenderWord = payload.slice(0, 64);
	const spender = `0x${spenderWord.slice(24)}`;
	return normalizeAddress(spender);
}

function isLikelyAllowanceError(message: string): boolean {
	return (
		/(allowance|insufficient allowance|approve|transfer amount exceeds allowance)/i.test(message) ||
		/(erc20: insufficient allowance|safeerc20)/i.test(message)
	);
}

function hasPriorSuccessfulApprovalForSpender(
	index: number,
	transactions: StagedTransaction[],
	simulations: TransactionSimulation[],
	spender: string
): boolean {
	for (let i = 0; i < index; i++) {
		if (simulations[i]?.status === 'failed') continue;
		const tx = transactions[i];
		const approvedSpender = parseApprovalSpender(tx.data);
		if (approvedSpender && approvedSpender === spender) {
			return true;
		}
	}
	return false;
}

function shouldMarkRequiresPriorState(
	index: number,
	tx: StagedTransaction,
	errorMessage: string,
	transactions: StagedTransaction[],
	simulations: TransactionSimulation[],
	request: StageSigningRequest
): boolean {
	if (request.metadata?.operationType !== 'strategy_deployment') return false;
	if (index === 0 || isApprovalTransaction(tx)) return false;

	const spender = normalizeAddress(tx.to);
	if (!spender) return false;
	if (!hasPriorSuccessfulApprovalForSpender(index, transactions, simulations, spender)) return false;

	if (isLikelyAllowanceError(errorMessage)) return true;
	// Providers often collapse allowance/dependency reverts into generic messages.
	return /(execution reverted|revert|call exception)/i.test(errorMessage);
}

function validateStageSigningRequest(request: StageSigningRequest): void {
	if (!request.executionToken || typeof request.executionToken !== 'string') {
		throw new StageSigningError(400, 'executionToken is required');
	}
	if (!Array.isArray(request.transactions) || request.transactions.length === 0) {
		throw new StageSigningError(400, 'transactions array is required and must not be empty');
	}

	for (let i = 0; i < request.transactions.length; i++) {
		const tx = request.transactions[i];
		if (!tx.to || !/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
			throw new StageSigningError(400, `Transaction ${i}: invalid "to" address`);
		}
		if (!tx.data || !tx.data.startsWith('0x')) {
			throw new StageSigningError(400, `Transaction ${i}: invalid "data" field`);
		}
		if (!tx.label || typeof tx.label !== 'string') {
			throw new StageSigningError(400, `Transaction ${i}: label is required`);
		}
	}
}

export async function stageSigningBundle(
	request: StageSigningRequest,
	config: ToolsConfig
): Promise<{ response: StageSigningResponse; userId: string }> {
	validateStageSigningRequest(request);

	let userId: string;
	try {
		userId = await resolveUserIdFromExecutionToken(request.executionToken, config.internalSecret);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid execution token';
		throw new StageSigningError(401, message);
	}

	const chain = getChain(config.chainName);
	const simulations: TransactionSimulation[] = [];

	for (let i = 0; i < request.transactions.length; i++) {
		const tx = request.transactions[i];
		const result = await simulateTransaction(
			{ to: tx.to, data: tx.data, value: tx.value, from: userId },
			config.rpcUrl,
			config.chainName
		);

		const errorMessage = result.success ? '' : result.returnData;
		const requiresPriorState = !result.success
			? shouldMarkRequiresPriorState(i, tx, errorMessage, request.transactions, simulations, request)
			: false;

		simulations.push({
			index: i,
			label: tx.label,
			success: result.success,
			status: result.success ? 'ok' : requiresPriorState ? 'requires_prior_state' : 'failed',
			reasonCode: requiresPriorState ? 'requires_prior_approval_execution' : undefined,
			gasUsed: result.gasUsed,
			error: result.success ? undefined : result.returnData
		});
	}

	const enrichedTxs = request.transactions.map((tx, i) => ({
		...tx,
		simulation: simulations[i]
	}));

	const signingId = createBundle(userId, chain.id, enrichedTxs, request.metadata);
	const readyToSign = simulations.every((s) => s.status !== 'failed');

	const response: StageSigningResponse = {
		signingId,
		summary: buildSummary(simulations),
		simulations,
		readyToSign,
		// Backward compatible gate for existing clients/skills.
		allSimulationsSucceeded: readyToSign
	};

	return { response, userId };
}

function checkInternalSecret(request: { headers: Record<string, string | string[] | undefined> }, config: ToolsConfig): boolean {
	const secret = request.headers['x-internal-secret'] as string | undefined;
	return !!secret && secret === config.internalSecret;
}

export async function signingRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: StageSigningRequest }>('/api/evm/stage-signing', async (request, reply) => {
		try {
			const { response, userId } = await stageSigningBundle(request.body, config);
			app.log.info(
				{
					signingId: response.signingId,
					userId,
					txCount: request.body.transactions.length,
					readyToSign: response.readyToSign,
					allSimulationsSucceeded: response.allSimulationsSucceeded,
					simulations: response.simulations.map((s) => ({
						label: s.label,
						status: s.status,
						error: s.error
					}))
				},
				'/api/evm/stage-signing created bundle'
			);
			return response;
		} catch (error) {
			if (error instanceof StageSigningError) {
				return reply.status(error.statusCode).send({ error: error.message });
			}
			const message = error instanceof Error ? error.message : 'Failed to stage signing bundle';
			return reply.status(500).send({ error: message });
		}
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
