import type { FastifyInstance, FastifyReply } from 'fastify';
import type { StageSigningRequest, StagedTransaction } from '@quant-bot/shared-types';
import type { ToolsConfig } from '../config.js';
import type {
	DeployStrategyRequest,
	ComposeRainlangRequest,
	DeployStrategyResponse
} from '../services/raindex-strategy.js';
import {
	composeStrategyRainlang,
	deployStrategyCalldata,
	getStrategyDetails,
	listStrategies
} from '../services/raindex-strategy.js';
import { RaindexMcpError } from '../services/raindex-mcp-client.js';
import { StageSigningError, stageSigningBundle } from './signing.js';

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	const lowered = value.toLowerCase();
	if (lowered === 'true') return true;
	if (lowered === 'false') return false;
	return undefined;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => typeof entry === 'string');
}

function handleMcpError(reply: FastifyReply, err: unknown) {
	if (err instanceof StageSigningError) {
		const source = err.statusCode === 401 ? 'auth' : 'validation';
		return reply.status(err.statusCode).send({
			error: err.message,
			source
		});
	}

	if (err instanceof RaindexMcpError) {
		console.error('[route] RaindexMcpError: status=%d message=%s', err.status, err.message);
		return reply.status(err.status).send({
			error: err.message,
			source: err.source
		});
	}

	const message = err instanceof Error ? err.message : 'Raindex MCP request failed';
	console.error('[route] unexpected error: %s', err instanceof Error ? err.message : String(err));
	return reply.status(500).send({
		error: message,
		source: 'internal'
	});
}

function badRequest(reply: FastifyReply, message: string) {
	return reply.status(400).send({
		error: message,
		source: 'validation'
	});
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

function buildDeploymentTransactions(deployment: DeployStrategyResponse): StagedTransaction[] {
	const txs: StagedTransaction[] = deployment.approvals.map((approval) => ({
		label: `Approve ${approval.symbol ?? 'Token'}`,
		to: approval.token,
		data: approval.approvalData,
		value: '0',
		symbol: approval.symbol
	}));

	txs.push({
		label: 'Deploy Strategy',
		to: deployment.to,
		data: deployment.data,
		value: deployment.value
	});

	return txs;
}

export async function raindexStrategyRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.get<{
		Querystring: { registryUrl?: string; forceRefresh?: string };
	}>('/api/strategy/list', async (request, reply) => {
		try {
			return await listStrategies(config, {
				registryUrl: request.query.registryUrl,
				forceRefresh: parseOptionalBoolean(request.query.forceRefresh)
			});
		} catch (err) {
			return handleMcpError(reply, err);
		}
	});

	app.get<{
		Params: { strategyKey: string };
		Querystring: { registryUrl?: string; forceRefresh?: string };
	}>('/api/strategy/details/:strategyKey', async (request, reply) => {
		try {
			return await getStrategyDetails(config, {
				strategyKey: request.params.strategyKey,
				registryUrl: request.query.registryUrl,
				forceRefresh: parseOptionalBoolean(request.query.forceRefresh)
			});
		} catch (err) {
			return handleMcpError(reply, err);
		}
	});

	app.post<{ Body: ComposeRainlangRequest }>('/api/order/strategy/compose', async (request, reply) => {
		if (!isNonEmptyString(request.body.dotrainSource)) {
			return badRequest(reply, '`dotrainSource` is required');
		}
		if (!isNonEmptyString(request.body.deploymentKey)) {
			return badRequest(reply, '`deploymentKey` is required');
		}

		try {
			return await composeStrategyRainlang(config, {
				dotrainSource: request.body.dotrainSource,
				deploymentKey: request.body.deploymentKey
			});
		} catch (err) {
			return handleMcpError(reply, err);
		}
	});

	app.post<{ Body: DeployStrategyRequest }>('/api/order/strategy/deploy', async (request, reply) => {
		if (!isNonEmptyString(request.body.strategyKey)) {
			return badRequest(reply, '`strategyKey` is required');
		}
		if (!isNonEmptyString(request.body.deploymentKey)) {
			return badRequest(reply, '`deploymentKey` is required');
		}
		if (!isNonEmptyString(request.body.owner)) {
			return badRequest(reply, '`owner` is required');
		}
		if (!isRecordOfStrings(request.body.fields)) {
			return badRequest(reply, '`fields` must be an object of string values');
		}
		if (request.body.deposits !== undefined && !isRecordOfStrings(request.body.deposits)) {
			return badRequest(reply, '`deposits` must be an object of string values');
		}
		if (request.body.selectTokens !== undefined && !isRecordOfStrings(request.body.selectTokens)) {
			return badRequest(reply, '`selectTokens` must be an object of string values');
		}

		try {
			return await deployStrategyCalldata(config, request.body);
		} catch (err) {
			return handleMcpError(reply, err);
		}
	});

	app.post<{ Body: DeployStrategyRequest & { executionToken: string; metadata?: StageSigningRequest['metadata'] } }>(
		'/api/order/strategy/deploy-and-stage',
		async (request, reply) => {
			if (!isNonEmptyString(request.body.executionToken)) {
				return badRequest(reply, '`executionToken` is required');
			}
			if (!isNonEmptyString(request.body.strategyKey)) {
				return badRequest(reply, '`strategyKey` is required');
			}
			if (!isNonEmptyString(request.body.deploymentKey)) {
				return badRequest(reply, '`deploymentKey` is required');
			}
			if (!isNonEmptyString(request.body.owner)) {
				return badRequest(reply, '`owner` is required');
			}
			if (!isRecordOfStrings(request.body.fields)) {
				return badRequest(reply, '`fields` must be an object of string values');
			}
			if (request.body.deposits !== undefined && !isRecordOfStrings(request.body.deposits)) {
				return badRequest(reply, '`deposits` must be an object of string values');
			}
			if (request.body.selectTokens !== undefined && !isRecordOfStrings(request.body.selectTokens)) {
				return badRequest(reply, '`selectTokens` must be an object of string values');
			}

			try {
				const deployment = await deployStrategyCalldata(config, request.body);
				const transactions = buildDeploymentTransactions(deployment);
				const metadata: StageSigningRequest['metadata'] = {
					...request.body.metadata,
					operationType: 'strategy_deployment',
					strategyKey: request.body.strategyKey,
					composedRainlang:
						request.body.metadata?.composedRainlang ?? deployment.composedRainlang
				};

				const { response } = await stageSigningBundle(
					{
						executionToken: request.body.executionToken,
						transactions,
						metadata
					},
					config
				);

				return {
					...response,
					deployment
				};
			} catch (err) {
				return handleMcpError(reply, err);
			}
		}
	);
}
