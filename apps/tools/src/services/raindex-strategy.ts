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

interface StrategySummary {
	key: string;
	name: string;
	description: string;
}

function summarizeStrategies(raw: unknown): StrategySummary[] {
	if (!raw || typeof raw !== 'object') return [];

	const root = raw as Record<string, unknown>;
	const candidate =
		root.valid && typeof root.valid === 'object' && !Array.isArray(root.valid)
			? (root.valid as unknown)
			: raw;

	if (Array.isArray(candidate)) {
		return candidate
			.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && !Array.isArray(e))
			.map((e) => ({
				key: typeof e.key === 'string' ? e.key : '',
				name: typeof e.name === 'string' ? e.name : '',
				description: typeof e.description === 'string' ? e.description : ''
			}))
			.filter((e) => e.key);
	}

	const strategies: StrategySummary[] = [];
	for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		const entry = value as Record<string, unknown>;
		strategies.push({
			key: typeof entry.key === 'string' && entry.key.trim() ? entry.key : key,
			name: typeof entry.name === 'string' ? entry.name : '',
			description: typeof entry.description === 'string' ? entry.description : ''
		});
	}

	return strategies.filter((e) => e.key);
}

export interface StrategyListResponse {
	display: string;
	strategies: StrategySummary[];
}

function buildStrategyListDisplay(strategies: StrategySummary[]): string {
	if (strategies.length === 0) return 'No strategies found.';
	return strategies
		.map((s) => `${s.key} — ${s.description || s.name}`)
		.join('\n');
}

export async function listStrategies(
	config: ToolsConfig,
	params: { registryUrl?: string; forceRefresh?: boolean }
): Promise<StrategyListResponse> {
	const registryUrl = params.registryUrl?.trim();
	const raw = await callRaindexMcpTool(config, 'raindex_list_strategies', {
		...(registryUrl ? { registry_url: registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
	const strategies = summarizeStrategies(raw);
	return {
		display: buildStrategyListDisplay(strategies),
		strategies
	};
}

interface FieldSummary {
	name: string;
	description: string;
	default?: string;
}

interface DeploymentSummary {
	key: string;
	name: string;
	description: string;
	fields: Record<string, FieldSummary>;
	selectTokens: Record<string, { name: string; description: string }>;
	_guiError?: string;
	deposits: string[];
}

interface StrategyDetailsSummary {
	name: string;
	description: string;
	deployments: DeploymentSummary[];
}

function pickString(obj: Record<string, unknown>, key: string, fallback = ''): string {
	return typeof obj[key] === 'string' ? obj[key] : fallback;
}

function summarizeStrategyDetails(raw: unknown): StrategyDetailsSummary | unknown {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
	const r = raw as Record<string, unknown>;

	const deployments: DeploymentSummary[] = [];
	const rawDeployments = r.deployments;
	if (rawDeployments && typeof rawDeployments === 'object') {
		const entries = Array.isArray(rawDeployments)
			? rawDeployments.map((d, i) => [String(i), d])
			: Object.entries(rawDeployments);

		for (const [key, dep] of entries) {
			if (!dep || typeof dep !== 'object' || Array.isArray(dep)) continue;
			const d = dep as Record<string, unknown>;

			const fields: Record<string, FieldSummary> = {};
			if (d.fields && typeof d.fields === 'object') {
				const fieldEntries: Array<[string, Record<string, unknown>]> = [];

				if (Array.isArray(d.fields)) {
					// Array format: [{ binding: "key-name", name: "Display", ... }]
					for (const item of d.fields) {
						if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
						const f = item as Record<string, unknown>;
						const key = typeof f.binding === 'string' ? f.binding : typeof f.key === 'string' ? f.key : '';
						if (key) fieldEntries.push([key, f]);
					}
				} else {
					// Object format: { "key-name": { name: "Display", ... } }
					for (const [fk, fv] of Object.entries(d.fields as Record<string, unknown>)) {
						if (!fv || typeof fv !== 'object' || Array.isArray(fv)) continue;
						fieldEntries.push([fk, fv as Record<string, unknown>]);
					}
				}

				for (const [fk, f] of fieldEntries) {
					fields[fk] = {
						name: pickString(f, 'name', fk),
						description: pickString(f, 'description'),
						...(typeof f.default === 'string' ? { default: f.default } : {})
					};
				}
			}

			const selectTokens: Record<string, { name: string; description: string }> = {};
			if (d.selectTokens && typeof d.selectTokens === 'object') {
				const tokenEntries: Array<[string, Record<string, unknown>]> = [];

				if (Array.isArray(d.selectTokens)) {
					for (const item of d.selectTokens) {
						if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
						const t = item as Record<string, unknown>;
						const key = typeof t.key === 'string' ? t.key : '';
						if (key) tokenEntries.push([key, t]);
					}
				} else {
					for (const [tk, tv] of Object.entries(d.selectTokens as Record<string, unknown>)) {
						if (!tv || typeof tv !== 'object' || Array.isArray(tv)) continue;
						tokenEntries.push([tk, tv as Record<string, unknown>]);
					}
				}

				for (const [tk, t] of tokenEntries) {
					selectTokens[tk] = {
						name: pickString(t, 'name', tk),
						description: pickString(t, 'description')
					};
				}
			}

			const deposits: string[] = [];
			if (d.deposits && typeof d.deposits === 'object') {
				if (Array.isArray(d.deposits)) {
					for (const item of d.deposits) {
						if (typeof item === 'string') {
							deposits.push(item);
						} else if (item && typeof item === 'object' && !Array.isArray(item)) {
							const obj = item as Record<string, unknown>;
							const token = typeof obj.token === 'string' ? obj.token : typeof obj.key === 'string' ? obj.key : '';
							if (token) deposits.push(token);
						}
					}
				} else {
					deposits.push(...Object.keys(d.deposits));
				}
			}

			deployments.push({
				key: typeof d.key === 'string' ? d.key : key,
				name: pickString(d, 'name', key),
				description: pickString(d, 'description'),
				fields,
				selectTokens,
				deposits,
				...(typeof d._guiError === 'string' ? { _guiError: d._guiError } : {})
			});
		}
	}

	if (deployments.length === 0) return raw;

	return {
		name: pickString(r, 'name'),
		description: pickString(r, 'description'),
		deployments
	};
}

export async function getStrategyDetails(
	config: ToolsConfig,
	params: { strategyKey: string; registryUrl?: string; forceRefresh?: boolean }
): Promise<unknown> {
	const registryUrl = params.registryUrl?.trim();
	const raw = await callRaindexMcpTool(config, 'raindex_get_strategy_details', {
		strategy_key: params.strategyKey,
		...(registryUrl ? { registry_url: registryUrl } : {}),
		...(params.forceRefresh !== undefined ? { force_refresh: params.forceRefresh } : {})
	});
	console.log('[strategy-details] raw MCP response for %s: %s', params.strategyKey, JSON.stringify(raw, null, 2).slice(0, 2000));
	const result = summarizeStrategyDetails(raw);
	console.log('[strategy-details] summarized result for %s: %s', params.strategyKey, JSON.stringify(result, null, 2).slice(0, 2000));
	return result;
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
	const registryUrl = params.registryUrl?.trim();
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

	const data = asRecord(payload, 'deploy strategy');

	const response: DeployStrategyResponse = {
		to: asString(data.orderbookAddress, 'orderbookAddress'),
		data: asString(data.deploymentCalldata, 'deploymentCalldata'),
		value: '0',
		chainId: asNumber(data.chainId, 'chainId'),
		approvals: normalizeApprovals(data.approvals)
	};

	// When dotrainSource is provided, a second MCP call (raindex_compose_rainlang) is made
	// to return the composed Rainlang for user review before execution.
	if (params.dotrainSource) {
		const composed = await composeStrategyRainlang(config, {
			dotrainSource: params.dotrainSource,
			deploymentKey: params.deploymentKey
		});
		response.composedRainlang = composed.rainlang;
	}

	return response;
}
