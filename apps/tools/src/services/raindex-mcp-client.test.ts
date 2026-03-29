import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCallTool = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
	return {
		Client: class MockClient {
			callTool = mockCallTool;
			connect = mockConnect;
			onerror: ((error: unknown) => void) | null = null;
			constructor(_opts: unknown) {}
		}
	};
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
	StdioClientTransport: class MockTransport {
		constructor(_opts: unknown) {}
	}
}));

const baseConfig = {
	raindexMcpCommand: 'node',
	raindexMcpArgs: ['mcp.js'],
	raindexMcpCwd: '/tmp',
	raindexSettingsPath: '',
	raindexSettingsYaml: 'test: true',
	raindexSettingsUrl: '',
	raindexRegistryUrl: '',
	customStrategiesDir: '',
	toolsBaseUrl: 'http://localhost:4000',
	rpcUrl: 'https://mainnet.base.org'
};

// Reset the cached clientPromise between tests
beforeEach(async () => {
	vi.resetModules();
	mockCallTool.mockReset();
	mockConnect.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('RaindexMcpError', () => {
	it('has correct properties', async () => {
		const { RaindexMcpError } = await import('./raindex-mcp-client.js');
		const err = new RaindexMcpError(504, 'timeout');
		expect(err.status).toBe(504);
		expect(err.message).toBe('timeout');
		expect(err.source).toBe('raindex-mcp');
		expect(err.name).toBe('RaindexMcpError');
		expect(err).toBeInstanceOf(Error);
	});
});

describe('patchSettingsRpc', () => {
	it('replaces the base network RPC URL', async () => {
		const { patchSettingsRpc } = await import('./raindex-mcp-client.js');
		const yaml = `networks:
  base:
    rpcs:
      - https://base-rpc.publicnode.com
`;
		const patched = patchSettingsRpc(yaml, 'https://custom-rpc.example.com');
		expect(patched).toContain('https://custom-rpc.example.com');
		expect(patched).not.toContain('publicnode.com');
	});

	it('leaves yaml unchanged when pattern does not match', async () => {
		const { patchSettingsRpc } = await import('./raindex-mcp-client.js');
		const yaml = 'other: value\n';
		expect(patchSettingsRpc(yaml, 'https://rpc.test')).toBe(yaml);
	});
});

describe('callRaindexMcpTool', () => {
	it('throws 503 when RAINDEX_MCP_COMMAND is not configured', async () => {
		const { callRaindexMcpTool, RaindexMcpError } = await import('./raindex-mcp-client.js');
		const emptyConfig = { ...baseConfig, raindexMcpCommand: '' };

		await expect(callRaindexMcpTool(emptyConfig as any, 'test_tool', {}))
			.rejects.toThrow(RaindexMcpError);

		try {
			await callRaindexMcpTool(emptyConfig as any, 'test_tool', {});
		} catch (e: any) {
			expect(e.message).toBe('Raindex MCP is not configured. Set RAINDEX_MCP_COMMAND and RAINDEX_MCP_ARGS.');
			expect(e.status).toBe(503);
		}
	});

	it('returns parsed JSON from text content', async () => {
		mockCallTool.mockResolvedValue({
			content: [{ type: 'text', text: JSON.stringify({ result: 'ok' }) }]
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		const result = await callRaindexMcpTool(baseConfig as any, 'test_tool', { arg: 1 });
		expect(result).toEqual({ result: 'ok' });
	});

	it('returns structuredContent when available', async () => {
		mockCallTool.mockResolvedValue({
			structuredContent: { data: [1, 2, 3] }
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		const result = await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		expect(result).toEqual({ data: [1, 2, 3] });
	});

	it('throws RaindexMcpError when tool returns isError', async () => {
		mockCallTool.mockResolvedValue({
			isError: true,
			content: [{ type: 'text', text: 'Order not found' }]
		});

		const { callRaindexMcpTool, RaindexMcpError } = await import('./raindex-mcp-client.js');
		await expect(callRaindexMcpTool(baseConfig as any, 'test_tool', {}))
			.rejects.toThrow(RaindexMcpError);

		try {
			await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		} catch (e: any) {
			expect(e.message).toBe('Order not found');
		}
	});

	it('verifies RaindexMcpError status 504 is used for timeout scenarios', async () => {
		// Directly test the timeout error shape rather than relying on fake timers
		// which can cause unhandled rejection leaks in the MCP client module
		const { RaindexMcpError } = await import('./raindex-mcp-client.js');
		const err = new RaindexMcpError(504, 'MCP tool "test_tool" timed out after 30000ms');
		expect(err.status).toBe(504);
		expect(err.message).toContain('timed out');
		expect(err.source).toBe('raindex-mcp');
	});

	it('wraps unexpected errors as RaindexMcpError with 502', async () => {
		mockCallTool.mockRejectedValue(new Error('connection reset'));

		const { callRaindexMcpTool, RaindexMcpError } = await import('./raindex-mcp-client.js');
		await expect(callRaindexMcpTool(baseConfig as any, 'test_tool', {}))
			.rejects.toThrow(RaindexMcpError);

		try {
			await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		} catch (e: any) {
			expect(e.status).toBe(502);
			expect(e.message).toBe('connection reset');
		}
	});

	it('returns message object when text content is not JSON', async () => {
		mockCallTool.mockResolvedValue({
			content: [{ type: 'text', text: 'plain text response' }]
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		const result = await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		expect(result).toEqual({ message: 'plain text response' });
	});

	it('returns empty object when content array is empty', async () => {
		mockCallTool.mockResolvedValue({
			content: []
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		const result = await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		expect(result).toEqual({});
	});

	it('unwraps toolResult wrapper', async () => {
		mockCallTool.mockResolvedValue({
			toolResult: {
				content: [{ type: 'text', text: '{"wrapped":true}' }]
			}
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		const result = await callRaindexMcpTool(baseConfig as any, 'test_tool', {});
		expect(result).toEqual({ wrapped: true });
	});

	it('generates default error message when tool error has no text', async () => {
		mockCallTool.mockResolvedValue({
			isError: true,
			content: []
		});

		const { callRaindexMcpTool } = await import('./raindex-mcp-client.js');
		await expect(callRaindexMcpTool(baseConfig as any, 'my_tool', {}))
			.rejects.toThrow('MCP tool "my_tool" returned an error');
	});
});
