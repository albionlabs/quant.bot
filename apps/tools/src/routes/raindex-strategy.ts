import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ToolsConfig } from '../config.js';
import type { DeployStrategyRequest, ComposeRainlangRequest } from '../services/raindex-strategy.js';
import {
	composeStrategyRainlang,
	deployStrategyCalldata,
	getStrategyDetails,
	listStrategies
} from '../services/raindex-strategy.js';
import { RaindexMcpError } from '../services/raindex-mcp-client.js';

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	if (value.toLowerCase() === 'true') return true;
	if (value.toLowerCase() === 'false') return false;
	return undefined;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => typeof entry === 'string');
}

function handleMcpError(reply: FastifyReply, err: unknown) {
	if (err instanceof RaindexMcpError) {
		console.error('[route] RaindexMcpError: status=%d message=%s', err.status, err.message);
		console.error('[route] RaindexMcpError stack: %s', err.stack);
		return reply.status(err.status).send({
			error: err.message,
			source: err.source
		});
	}

	const message = err instanceof Error ? err.message : 'Raindex MCP request failed';
	console.error('[route] unexpected error: %s', err instanceof Error ? err.stack ?? err.message : String(err));
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
		console.log('[route] POST /api/order/strategy/deploy body=%s', JSON.stringify(request.body).slice(0, 2000));
		const rawDotrainSource = (request.body as { dotrainSource?: unknown }).dotrainSource;
		let dotrainSource: string | undefined;
		if (rawDotrainSource !== undefined) {
			if (!isNonEmptyString(rawDotrainSource)) {
				return badRequest(reply, '`dotrainSource` must be a non-empty string when provided');
			}
			dotrainSource = rawDotrainSource;
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
			console.error('[route] fields validation failed: %s', JSON.stringify(request.body.fields));
			return badRequest(reply, '`fields` must be an object of string values');
		}
		if (request.body.deposits !== undefined && !isRecordOfStrings(request.body.deposits)) {
			console.error('[route] deposits validation failed: %s', JSON.stringify(request.body.deposits));
			return badRequest(reply, '`deposits` must be an object of string values');
		}
		if (request.body.selectTokens !== undefined && !isRecordOfStrings(request.body.selectTokens)) {
			console.error('[route] selectTokens validation failed: %s', JSON.stringify(request.body.selectTokens));
			return badRequest(reply, '`selectTokens` must be an object of string values');
		}

		try {
			const result = await deployStrategyCalldata(config, {
				...request.body,
				dotrainSource
			});
			console.log('[route] deploy succeeded: to=%s chainId=%d', result.to, result.chainId);
			return result;
		} catch (err) {
			return handleMcpError(reply, err);
		}
	});
}
