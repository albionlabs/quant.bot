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
		let approvalData: string | null = null;
		if (typeof record.calldata === 'string') {
			approvalData = record.calldata;
		} else if (typeof record.approvalData === 'string') {
			approvalData = record.approvalData;
		}

		if (!token || !approvalData) continue;
		const symbol = typeof record.symbol === 'string' ? record.symbol : undefined;
		approvals.push({ token, approvalData, symbol });
	}

	return approvals;
}

export async function listStrategies(
	config: ToolsConfig,
	params: { registryUrl?: string; forceRefresh?: boolean }
): Promise<unknown> {
	const registryUrl = params.registryUrl || config.raindexRegistryUrl;
	return callRaindexMcpTool(config, 'raindex_list_strategies', {
		...(registryUrl ? { registry_url: registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
}

export async function getStrategyDetails(
	config: ToolsConfig,
	params: { strategyKey: string; registryUrl?: string; forceRefresh?: boolean }
): Promise<unknown> {
	const registryUrl = params.registryUrl || config.raindexRegistryUrl;
	return callRaindexMcpTool(config, 'raindex_get_strategy_details', {
		strategy_key: params.strategyKey,
		...(registryUrl ? { registry_url: registryUrl } : {}),
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
	console.log('[deploy] deployStrategyCalldata called: strategyKey=%s deploymentKey=%s owner=%s fields=%s selectTokens=%s deposits=%s',
		params.strategyKey, params.deploymentKey, params.owner,
		JSON.stringify(params.fields), JSON.stringify(params.selectTokens), JSON.stringify(params.deposits));

	const registryUrl = params.registryUrl || config.raindexRegistryUrl;
	const payload = await callRaindexMcpTool(config, 'raindex_deploy_strategy', {
		strategy_key: params.strategyKey,
		deployment_key: params.deploymentKey,
		owner: params.owner,
		fields: params.fields,
		...(params.deposits ? { deposits: params.deposits } : {}),
		...(params.selectTokens ? { select_tokens: params.selectTokens } : {}),
		...(registryUrl ? { registry_url: registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});

	console.log('[deploy] raw payload from MCP: type=%s', typeof payload);
	try {
		const payloadStr = JSON.stringify(payload);
		const preview = payloadStr.length > 2000 ? payloadStr.slice(0, 2000) + '...' : payloadStr;
		console.log('[deploy] raw payload: %s', preview);
	} catch { /* circular ref guard */ }

	const data = asRecord(payload, 'deploy strategy');
	console.log('[deploy] asRecord keys: %s', Object.keys(data).join(', '));
	console.log('[deploy] field types: orderbookAddress=%s deploymentCalldata=%s chainId=%s approvals=%s',
		typeof data.orderbookAddress, typeof data.deploymentCalldata, typeof data.chainId, typeof data.approvals);
	if (typeof data.orderbookAddress === 'string') console.log('[deploy] orderbookAddress=%s', data.orderbookAddress.slice(0, 66));
	if (typeof data.deploymentCalldata === 'string') console.log('[deploy] deploymentCalldata length=%d prefix=%s', data.deploymentCalldata.length, data.deploymentCalldata.slice(0, 20));

	const response: DeployStrategyResponse = {
		to: asString(data.orderbookAddress, 'orderbookAddress'),
		data: asString(data.deploymentCalldata, 'deploymentCalldata'),
		value: '0',
		chainId: asNumber(data.chainId, 'chainId'),
		approvals: normalizeApprovals(data.approvals)
	};

	console.log('[deploy] normalized response: to=%s chainId=%d approvalsCount=%d calldataLen=%d',
		response.to, response.chainId, response.approvals.length, response.data.length);

	// When dotrainSource is provided, a second MCP call (raindex_compose_rainlang) is made
	// to return the composed Rainlang for user review before execution.
	if (typeof params.dotrainSource === 'string' && params.dotrainSource.trim() !== '') {
		const composed = await composeStrategyRainlang(config, {
			dotrainSource: params.dotrainSource,
			deploymentKey: params.deploymentKey
		});
		response.composedRainlang = composed.rainlang;
	}

	return response;
}
