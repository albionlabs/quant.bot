import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ToolsConfig } from '../config.js';
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
		return reply.status(err.status).send({
			error: err.message,
			source: err.source
		});
	}

	const message = err instanceof Error ? err.message : 'Raindex MCP request failed';
	return reply.status(500).send({
		error: message,
		source: 'raindex-mcp'
	});
}

function badRequest(reply: FastifyReply, message: string) {
	return reply.status(400).send({
		error: message,
		source: 'raindex-mcp'
	});
}

interface DeployStrategyBody {
	strategyKey: string;
	deploymentKey: string;
	owner: string;
	fields: Record<string, string>;
	deposits?: Record<string, string>;
	selectTokens?: Record<string, string>;
	registryUrl?: string;
	forceRefresh?: boolean;
	dotrainSource?: string;
}

interface ComposeRainlangBody {
	dotrainSource: string;
	deploymentKey: string;
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

	app.post<{ Body: ComposeRainlangBody }>('/api/order/strategy/compose', async (request, reply) => {
		if (typeof request.body.dotrainSource !== 'string' || request.body.dotrainSource.trim() === '') {
			return badRequest(reply, '`dotrainSource` is required');
		}
		if (typeof request.body.deploymentKey !== 'string' || request.body.deploymentKey.trim() === '') {
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

	app.post<{ Body: DeployStrategyBody }>('/api/order/strategy/deploy', async (request, reply) => {
		if (typeof request.body.strategyKey !== 'string' || request.body.strategyKey.trim() === '') {
			return badRequest(reply, '`strategyKey` is required');
		}
		if (typeof request.body.deploymentKey !== 'string' || request.body.deploymentKey.trim() === '') {
			return badRequest(reply, '`deploymentKey` is required');
		}
		if (typeof request.body.owner !== 'string' || request.body.owner.trim() === '') {
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
}
