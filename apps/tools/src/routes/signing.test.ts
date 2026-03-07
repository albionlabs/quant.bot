import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageSigningRequest } from '@quant-bot/shared-types';
import type { ToolsConfig } from '../config.js';

const {
	resolveUserIdFromExecutionToken,
	simulateTransaction,
	createBundle,
	getChain
} = vi.hoisted(() => ({
	resolveUserIdFromExecutionToken: vi.fn(),
	simulateTransaction: vi.fn(),
	createBundle: vi.fn(),
	getChain: vi.fn()
}));

vi.mock('../services/execution-token.js', () => ({ resolveUserIdFromExecutionToken }));
vi.mock('../services/evm-simulator.js', () => ({ simulateTransaction }));
vi.mock('../services/signing-store.js', async () => {
	const actual = await vi.importActual<typeof import('../services/signing-store.js')>(
		'../services/signing-store.js'
	);
	return {
		...actual,
		createBundle
	};
});
vi.mock('@quant-bot/evm-utils', () => ({ getChain }));

import { stageSigningBundle } from './signing.js';

const config: ToolsConfig = {
	port: 4000,
	host: '127.0.0.1',
	rpcUrl: 'http://localhost:8545',
	chainName: 'base',
	internalSecret: 'secret',
	raindexMcpCommand: 'node',
	raindexMcpArgs: ['dist/index.js'],
	raindexMcpCwd: '/tmp',
	raindexSettingsPath: '',
	raindexSettingsYaml: 'yaml',
	raindexSettingsUrl: '',
	raindexRegistryUrl: 'https://example.com/registry',
	customStrategiesDir: '',
	toolsBaseUrl: 'http://127.0.0.1:4000'
};

const userAddress = '0x1234567890abcdef1234567890abcdef12345678';
const tokenAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const orderbookAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const approvalCalldata = `0x095ea7b3${'0'.repeat(24)}${orderbookAddress.slice(2)}${'f'.repeat(64)}`;

describe('stageSigningBundle', () => {
	beforeEach(() => {
		resolveUserIdFromExecutionToken.mockReset();
		simulateTransaction.mockReset();
		createBundle.mockReset();
		getChain.mockReset();

		resolveUserIdFromExecutionToken.mockResolvedValue(userAddress);
		createBundle.mockReturnValue('bundle-123');
		getChain.mockReturnValue({ id: 8453 });
	});

	it('marks deploy revert as requires_prior_state when prior approvals target the deploy spender', async () => {
		simulateTransaction
			.mockResolvedValueOnce({ success: true, returnData: '0x', gasUsed: '52000' })
			.mockResolvedValueOnce({
				success: false,
				returnData: 'execution reverted: ERC20: insufficient allowance',
				gasUsed: '0'
			});

		const request: StageSigningRequest = {
			executionToken: 'token',
			transactions: [
				{
					label: 'Approve USDC',
					to: tokenAddress,
					data: approvalCalldata,
					value: '0'
				},
				{
					label: 'Deploy Strategy',
					to: orderbookAddress,
					data: '0xdeadbeef',
					value: '0'
				}
			],
			metadata: {
				operationType: 'strategy_deployment',
				strategyKey: 'fixed-limit'
			}
		};

		const { response } = await stageSigningBundle(request, config);

		expect(response.signingId).toBe('bundle-123');
		expect(response.readyToSign).toBe(true);
		expect(response.allSimulationsSucceeded).toBe(true);
		expect(response.simulations[1]).toMatchObject({
			success: false,
			status: 'requires_prior_state',
			reasonCode: 'requires_prior_approval_execution'
		});
	});

	it('fails readiness when there is no approval dependency match', async () => {
		simulateTransaction.mockResolvedValueOnce({
			success: false,
			returnData: 'execution reverted: invalid order config',
			gasUsed: '0'
		});

		const request: StageSigningRequest = {
			executionToken: 'token',
			transactions: [
				{
					label: 'Deploy Strategy',
					to: orderbookAddress,
					data: '0xdeadbeef',
					value: '0'
				}
			],
			metadata: {
				operationType: 'strategy_deployment',
				strategyKey: 'fixed-limit'
			}
		};

		const { response } = await stageSigningBundle(request, config);

		expect(response.readyToSign).toBe(false);
		expect(response.allSimulationsSucceeded).toBe(false);
		expect(response.simulations[0].status).toBe('failed');
	});
});
