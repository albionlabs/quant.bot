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
	internalSecret: '',
	raindexMcpCommand: 'node',
	raindexMcpArgs: ['dist/index.js'],
	raindexMcpCwd: '',
	raindexSettingsPath: '',
	raindexSettingsYaml: '',
	raindexSettingsUrl: '',
	raindexRegistryUrl: 'https://example.com/registry',
	customStrategiesDir: '',
	toolsBaseUrl: 'http://127.0.0.1:4000'
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

		expect(result.strategies).toEqual([{ key: 'fixed-limit', name: '', description: '' }]);
		expect(result.display).toContain('fixed-limit');
		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_list_strategies', {
			registry_url: 'https://example.com/custom-registry',
			force_refresh: true
		});
	});

	it('handles map-shaped strategy responses from MCP', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({
			'fixed-limit': { name: 'Fixed Limit', description: 'A limit order' },
			'oil-token-fair-value': {
				name: 'Oil reserve straight-line discount',
				description: 'Oil-linked fair value strategy'
			}
		});

		const result = await listStrategies(config, {});

		expect(result.strategies).toEqual([
			{ key: 'fixed-limit', name: 'Fixed Limit', description: 'A limit order' },
			{
				key: 'oil-token-fair-value',
				name: 'Oil reserve straight-line discount',
				description: 'Oil-linked fair value strategy'
			}
		]);
		expect(result.display).toContain('oil-token-fair-value');
	});

	it('handles wrapped valid/invalid strategy responses from MCP', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({
			valid: {
				'fixed-limit': { name: 'Fixed Limit', description: 'A limit order' },
				'oil-token-fair-value-dca': {
					name: 'Oil reserve auction DCA',
					description: 'Auction-DCA with an oil-NAV floor.'
				}
			},
			invalid: {
				'broken-strategy': { error: 'parse failure' }
			}
		});

		const result = await listStrategies(config, {});

		expect(result.strategies).toEqual([
			{ key: 'fixed-limit', name: 'Fixed Limit', description: 'A limit order' },
			{
				key: 'oil-token-fair-value-dca',
				name: 'Oil reserve auction DCA',
				description: 'Auction-DCA with an oil-NAV floor.'
			}
		]);
		expect(result.display).not.toContain('valid');
		expect(result.display).not.toContain('invalid');
	});

	it('omits registry_url when none provided', async () => {
		callRaindexMcpTool.mockResolvedValueOnce([{ key: 'fixed-limit' }]);

		await listStrategies(config, {});

		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_list_strategies', {});
	});

	it('passes strategy detail params to MCP', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({ name: 'Fixed Limit' });

		const result = await getStrategyDetails(config, {
			strategyKey: 'fixed-limit'
		});

		expect(result).toEqual({ name: 'Fixed Limit' });
		expect(callRaindexMcpTool).toHaveBeenCalledWith(config, 'raindex_get_strategy_details', {
			strategy_key: 'fixed-limit'
		});
	});

	it('extracts field bindings from object-format deployments (raindex-mcp format)', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({
			deployments: {
				'base-inv': {
					name: 'Base buy reserve tokens',
					description: 'Inverse orientation.',
					fields: {
						'oracle-price-timeout': { name: 'Oracle price timeout', description: 'Max staleness.', default: '300' },
						'barrels-of-oil': { name: 'Total barrels of oil', description: 'Initial reserve.' },
						'required-discount': { name: 'Required discount', description: 'Decimal fraction.', default: '0.20' }
					},
					selectTokens: {
						output: { name: 'Token to Sell', description: 'Reserve token' },
						input: { name: 'Token to Buy', description: 'Payment token' }
					},
					deposits: ['output']
				}
			}
		});

		const result = await getStrategyDetails(config, { strategyKey: 'oil-token-fair-value-dca' }) as {
			deployments: Array<{
				key: string;
				fields: Record<string, { name: string; description: string; default?: string }>;
				selectTokens: Record<string, { name: string; description: string }>;
				deposits: string[];
			}>;
		};

		expect(result.deployments).toHaveLength(1);
		const dep = result.deployments[0];
		expect(dep.key).toBe('base-inv');
		expect(dep.fields['oracle-price-timeout']).toEqual({ name: 'Oracle price timeout', description: 'Max staleness.', default: '300' });
		expect(dep.fields['barrels-of-oil']).toEqual({ name: 'Total barrels of oil', description: 'Initial reserve.' });
		expect(dep.fields['required-discount']).toEqual({ name: 'Required discount', description: 'Decimal fraction.', default: '0.20' });
		expect(dep.selectTokens).toEqual({
			output: { name: 'Token to Sell', description: 'Reserve token' },
			input: { name: 'Token to Buy', description: 'Payment token' }
		});
		expect(dep.deposits).toEqual(['output']);
	});

	it('extracts field bindings from array-format deployments', async () => {
		callRaindexMcpTool.mockResolvedValueOnce({
			name: 'Oil reserve auction DCA',
			description: 'Auction-DCA with an oil-NAV floor.',
			deployments: {
				'base-inv': {
					name: 'Base buy reserve tokens',
					description: 'Inverse orientation.',
					fields: [
						{ binding: 'oracle-price-timeout', name: 'Oracle price timeout', description: 'Max staleness.', default: '300' },
						{ binding: 'barrels-of-oil', name: 'Total barrels of oil', description: 'Initial reserve.' },
						{ binding: 'required-discount', name: 'Required discount', description: 'Decimal fraction.', default: '0.20' }
					],
					selectTokens: [
						{ key: 'output', name: 'Token to Sell', description: 'Reserve token' },
						{ key: 'input', name: 'Token to Buy', description: 'Payment token' }
					],
					deposits: [{ token: 'output' }]
				}
			}
		});

		const result = await getStrategyDetails(config, { strategyKey: 'oil-token-fair-value-dca' }) as {
			deployments: Array<{
				key: string;
				fields: Record<string, { name: string; description: string; default?: string }>;
				selectTokens: Record<string, { name: string; description: string }>;
				deposits: string[];
			}>;
		};

		expect(result.deployments).toHaveLength(1);
		const dep = result.deployments[0];
		expect(dep.key).toBe('base-inv');
		expect(dep.fields).toEqual({
			'oracle-price-timeout': { name: 'Oracle price timeout', description: 'Max staleness.', default: '300' },
			'barrels-of-oil': { name: 'Total barrels of oil', description: 'Initial reserve.' },
			'required-discount': { name: 'Required discount', description: 'Decimal fraction.', default: '0.20' }
		});
		expect(dep.selectTokens).toEqual({
			output: { name: 'Token to Sell', description: 'Reserve token' },
			input: { name: 'Token to Buy', description: 'Payment token' }
		});
		expect(dep.deposits).toEqual(['output']);
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
			fields: { 'fixed-io': '0.0005' }
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
