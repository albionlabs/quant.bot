import type { ToolsConfig } from '../config.js';
import { RaindexMcpError, callRaindexMcpTool } from './raindex-mcp-client.js';

export interface DeployStrategyRequest {
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

export interface ComposeRainlangRequest {
	dotrainSource: string;
	deploymentKey: string;
}

interface NormalizedApproval {
	token: string;
	approvalData: string;
	symbol?: string;
}

export interface DeployStrategyResponse {
	to: string;
	data: string;
	value: string;
	chainId: number;
	approvals: NormalizedApproval[];
	composedRainlang?: string;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new RaindexMcpError(502, `Invalid ${context} payload returned from Raindex MCP`);
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown, key: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new RaindexMcpError(502, `Raindex MCP response is missing "${key}"`);
	}
	return value;
}

function asNumber(value: unknown, key: string): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	throw new RaindexMcpError(502, `Raindex MCP response has invalid "${key}"`);
}

function normalizeApprovals(raw: unknown): NormalizedApproval[] {
	if (!Array.isArray(raw)) return [];

	const approvals: NormalizedApproval[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
		const record = item as Record<string, unknown>;
		const token = typeof record.token === 'string' ? record.token : null;
		const approvalData =
			typeof record.calldata === 'string'
				? record.calldata
				: typeof record.approvalData === 'string'
					? record.approvalData
					: null;

		if (!token || !approvalData) continue;
		const symbol = typeof record.symbol === 'string' ? record.symbol : undefined;
		approvals.push({ token, approvalData, ...(symbol ? { symbol } : {}) });
	}

	return approvals;
}

export async function listStrategies(
	config: ToolsConfig,
	params: { registryUrl?: string; forceRefresh?: boolean }
): Promise<unknown> {
	return callRaindexMcpTool(config, 'raindex_list_strategies', {
		...(params.registryUrl ? { registry_url: params.registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
}

export async function getStrategyDetails(
	config: ToolsConfig,
	params: { strategyKey: string; registryUrl?: string; forceRefresh?: boolean }
): Promise<unknown> {
	return callRaindexMcpTool(config, 'raindex_get_strategy_details', {
		strategy_key: params.strategyKey,
		...(params.registryUrl ? { registry_url: params.registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
}

export async function composeStrategyRainlang(
	config: ToolsConfig,
	params: ComposeRainlangRequest
): Promise<{ rainlang: string }> {
	const payload = await callRaindexMcpTool(config, 'raindex_compose_rainlang', {
		dotrain_source: params.dotrainSource,
		deployment_key: params.deploymentKey
	});
	const data = asRecord(payload, 'compose rainlang');
	return { rainlang: asString(data.rainlang, 'rainlang') };
}

export async function deployStrategyCalldata(
	config: ToolsConfig,
	params: DeployStrategyRequest
): Promise<DeployStrategyResponse> {
	const payload = await callRaindexMcpTool(config, 'raindex_deploy_strategy', {
		strategy_key: params.strategyKey,
		deployment_key: params.deploymentKey,
		owner: params.owner,
		fields: params.fields,
		...(params.deposits ? { deposits: params.deposits } : {}),
		...(params.selectTokens ? { select_tokens: params.selectTokens } : {}),
		...(params.registryUrl ? { registry_url: params.registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
	const data = asRecord(payload, 'deploy strategy');

	const response: DeployStrategyResponse = {
		to: asString(data.orderbookAddress, 'orderbookAddress'),
		data: asString(data.deploymentCalldata, 'deploymentCalldata'),
		value: '0',
		chainId: asNumber(data.chainId, 'chainId'),
		approvals: normalizeApprovals(data.approvals)
	};

	if (params.dotrainSource) {
		const composed = await composeStrategyRainlang(config, {
			dotrainSource: params.dotrainSource,
			deploymentKey: params.deploymentKey
		});
		response.composedRainlang = composed.rainlang;
	}

	return response;
}
