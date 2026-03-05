import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	composeStrategyRainlang,
	deployStrategyCalldata,
	getStrategyDetails,
	listStrategies
} from './raindex-strategy.js';
import type { ToolsConfig } from '../config.js';

const { callRaindexMcpTool } = vi.hoisted(() => ({
	callRaindexMcpTool: vi.fn()
}));

vi.mock('./raindex-mcp-client.js', async (importOriginal) => {
	const mod = await importOriginal<typeof import('./raindex-mcp-client.js')>();
	return { ...mod, callRaindexMcpTool };
});

const config = {
	port: 4000,
	host: '0.0.0.0',
	rpcUrl: 'https://mainnet.base.org',
	chainName: 'base',
	delegationServiceUrl: 'http://delegation:5000',
	internalSecret: '',
	dynamicEnvironmentId: '',
	dynamicSigningKey: '',
	raindexMcpCommand: 'node',
	raindexMcpArgs: ['dist/index.js'],
	raindexMcpCwd: '',
	raindexSettingsPath: '',
	raindexSettingsYaml: '',
	raindexSettingsUrl: '',
	raindexRegistryUrl: 'https://example.com/registry'
} satisfies ToolsConfig;

describe('raindex strategy service', () => {
	beforeEach(() => {
		callRaindexMcpTool.mockReset();
	});

	it('passes list strategy params to MCP', async () => {
		callRaindexMcpTool.mockResolvedValueOnce([{ key: 'fixed-limit' }]);

		const result = await listStrategies(config, {
			registryUrl: 'https://example.com/custom-registry',
			forceRefresh: true
		});

		expect(result).toEqual([{ key: 'fixed-limit' }]);
		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_list_strategies', {
			registry_url: 'https://example.com/custom-registry',
			force_refresh: true
		});
	});

	it('falls back to config registry URL when none provided', async () => {
		callRaindexMcpTool.mockResolvedValueOnce([{ key: 'fixed-limit' }]);

		await listStrategies(config, {});

		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_list_strategies', {
			registry_url: 'https://example.com/registry'
		});
	});

	it('passes strategy detail params to MCP', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({ name: 'Fixed Limit' });

		const result = await getStrategyDetails(config, {
			strategyKey: 'fixed-limit'
		});

		expect(result).toEqual({ name: 'Fixed Limit' });
		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_get_strategy_details', {
			strategy_key: 'fixed-limit',
			registry_url: 'https://example.com/registry'
		});
	});

	it('normalizes deploy calldata response', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({
			orderbookAddress: '0xOrderbook',
			deploymentCalldata: '0xDeploy',
			chainId: 8453,
			approvals: [{ token: '0xToken', symbol: 'USDC', calldata: '0xApprove' }]
		});

		const result = await deployStrategyCalldata(config, {
			strategyKey: 'fixed-limit',
			deploymentKey: 'base',
			owner: '0xOwner',
			fields: { 'fixed-io': '0.0005' }
		});

		expect(result).toEqual({
			to: '0xOrderbook',
			data: '0xDeploy',
			value: '0',
			chainId: 8453,
			approvals: [{ token: '0xToken', symbol: 'USDC', approvalData: '0xApprove' }]
		});

		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_deploy_strategy', {
			strategy_key: 'fixed-limit',
			deployment_key: 'base',
			owner: '0xOwner',
			fields: { 'fixed-io': '0.0005' },
			registry_url: 'https://example.com/registry'
		});
	});

	it('adds composed rainlang when dotrain source is provided', async () => {
		callRaindexMcpTool
			.mockResolvedValueOnce({
				orderbookAddress: '0xOrderbook',
				deploymentCalldata: '0xDeploy',
				chainId: '8453',
				approvals: []
			})
			.mockResolvedValueOnce({ rainlang: '#calculate-io\n_: 0;' });

		const result = await deployStrategyCalldata(config, {
			strategyKey: 'fixed-limit',
			deploymentKey: 'base',
			owner: '0xOwner',
			fields: {},
			dotrainSource: 'version: 4\n...'
		});

		expect(result.composedRainlang).toBe('#calculate-io\n_: 0;');
		expect(callRaindexMcpTool).toHaveBeenNthCalledWith(2, config, 'raindex_compose_rainlang', {
			dotrain_source: 'version: 4\n...',
			deployment_key: 'base'
		});
	});

	it('throws on malformed deploy payload', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({ chainId: 8453 });

		await expect(
			deployStrategyCalldata(config, {
				strategyKey: 'fixed-limit',
				deploymentKey: 'base',
				owner: '0xOwner',
				fields: {}
			})
		).rejects.toThrow('orderbookAddress');
	});

	it('returns composed rainlang', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({ rainlang: '#handle-io\n:;' });

		const result = await composeStrategyRainlang(config, {
			dotrainSource: 'version: 4\n...',
			deploymentKey: 'base'
		});

		expect(result).toEqual({ rainlang: '#handle-io\n:;' });
	});
});
