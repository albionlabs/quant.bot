import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolsConfig } from '../config.js';

export class RaindexMcpError extends Error {
	status: number;
	source: 'raindex-mcp';

	constructor(status: number, message: string) {
		super(message);
		this.name = 'RaindexMcpError';
		this.status = status;
		this.source = 'raindex-mcp';
	}
}

let clientPromise: Promise<Client> | null = null;

interface ToolResultLike {
	isError?: boolean;
	content?: unknown;
	structuredContent?: unknown;
	toolResult?: unknown;
}

const MCP_CALL_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new RaindexMcpError(504, message)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

function normalizeToolResult(result: unknown): ToolResultLike {
	if (!result || typeof result !== 'object') {
		console.warn('[raindex-mcp] normalizeToolResult: result is not an object', typeof result, result);
		return {};
	}
	const record = result as ToolResultLike;
	if (record.toolResult && typeof record.toolResult === 'object') {
		return record.toolResult as ToolResultLike;
	}
	return record;
}

function getTextContent(result: ToolResultLike): string[] {
	const chunks: string[] = [];

	if (!Array.isArray(result.content)) return chunks;

	for (const item of result.content) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		if (record.type !== 'text') continue;
		if (typeof record.text !== 'string') continue;
		const text = record.text.trim();
		if (!text) continue;
		chunks.push(text);
	}

	return chunks;
}

function parseToolPayload(result: ToolResultLike): unknown {
	if (result.structuredContent !== undefined) {
		return result.structuredContent;
	}

	const textChunks = getTextContent(result);

	if (textChunks.length === 0) {
		console.warn('[raindex-mcp] parseToolPayload: no text content, returning {}');
		return {};
	}

	if (textChunks.length === 1) {
		const parsed = tryParseJson(textChunks[0]);
		if (!parsed) {
			console.warn('[raindex-mcp] parseToolPayload: single chunk is not valid JSON, returning as message');
		}
		return parsed ?? { message: textChunks[0] };
	}

	for (const chunk of textChunks) {
		const parsed = tryParseJson(chunk);
		if (parsed !== null) return parsed;
	}

	console.warn('[raindex-mcp] parseToolPayload: no JSON found in any chunk, returning messages array');
	return { messages: textChunks };
}

function extractToolError(result: ToolResultLike, toolName: string): string {
	const text = getTextContent(result).join('\n').trim();
	if (text) return text;

	if (result.structuredContent !== undefined) {
		try {
			return JSON.stringify(result.structuredContent);
		} catch {
			// no-op
		}
	}

	return `MCP tool "${toolName}" returned an error`;
}

function ensureLocalDbRemotes(yaml: string): string {
	if (/^local-db-remotes\s*:/m.test(yaml)) return yaml;
	return yaml.endsWith('\n') ? `${yaml}local-db-remotes: {}` : `${yaml}\nlocal-db-remotes: {}`;
}

async function resolveSettingsYaml(config: ToolsConfig): Promise<string | null> {
	if (config.raindexSettingsYaml) {
		return ensureLocalDbRemotes(config.raindexSettingsYaml);
	}

	if (!config.raindexSettingsUrl) {
		return null;
	}

	let response: Response;
	try {
		response = await fetch(config.raindexSettingsUrl, {
			signal: AbortSignal.timeout(15_000)
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'request failed';
		throw new RaindexMcpError(
			502,
			`Failed to fetch RAINDEX_SETTINGS_URL (${config.raindexSettingsUrl}): ${message}`
		);
	}

	if (!response.ok) {
		throw new RaindexMcpError(
			502,
			`Failed to fetch RAINDEX_SETTINGS_URL (${config.raindexSettingsUrl}): HTTP ${response.status}`
		);
	}

	const yaml = await response.text();
	if (!yaml.trim()) {
		throw new RaindexMcpError(
			502,
			`RAINDEX_SETTINGS_URL returned an empty settings document: ${config.raindexSettingsUrl}`
		);
	}

	return ensureLocalDbRemotes(yaml);
}

async function createClient(config: ToolsConfig): Promise<Client> {
	if (!config.raindexMcpCommand) {
		throw new RaindexMcpError(
			503,
			'Raindex MCP is not configured. Set RAINDEX_MCP_COMMAND and RAINDEX_MCP_ARGS.'
		);
	}

	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === 'string') {
			env[key] = value;
		}
	}

	const resolvedSettingsYaml = await resolveSettingsYaml(config);

	delete env.RAINDEX_SETTINGS_PATH;
	delete env.RAINDEX_SETTINGS_YAML;
	delete env.RAINDEX_SETTINGS_URL;

	if (config.raindexSettingsPath) env.RAINDEX_SETTINGS_PATH = config.raindexSettingsPath;
	if (resolvedSettingsYaml) env.RAINDEX_SETTINGS_YAML = resolvedSettingsYaml;

	if (config.customStrategiesDir) {
		env.RAINDEX_REGISTRY_URL = `${config.toolsBaseUrl}/api/strategies/registry`;
	} else if (config.raindexRegistryUrl) {
		env.RAINDEX_REGISTRY_URL = config.raindexRegistryUrl;
	}

	const transport = new StdioClientTransport({
		command: config.raindexMcpCommand,
		args: config.raindexMcpArgs,
		cwd: config.raindexMcpCwd || undefined,
		env
	});

	const client = new Client({
		name: 'quant-bot-tools',
		version: '0.0.1'
	});

	client.onerror = (error) => {
		console.error('[raindex-mcp] client error', error);
		clientPromise = null;
	};

	await client.connect(transport);
	return client;
}

async function getClient(config: ToolsConfig): Promise<Client> {
	if (!clientPromise) {
		clientPromise = createClient(config).catch((error: unknown) => {
			clientPromise = null;
			throw error;
		});
	}

	return clientPromise;
}

export async function callRaindexMcpTool(
	config: ToolsConfig,
	toolName: string,
	toolArgs: Record<string, unknown>
): Promise<unknown> {
	const client = await getClient(config);
	try {
		const result = await withTimeout(
			client.callTool({ name: toolName, arguments: toolArgs }),
			MCP_CALL_TIMEOUT_MS,
			`MCP tool "${toolName}" timed out after ${MCP_CALL_TIMEOUT_MS}ms`
		);

		const normalized = normalizeToolResult(result);

		if (normalized.isError) {
			const errorText = extractToolError(normalized, toolName);
			console.error('[raindex-mcp] MCP tool returned error: %s', errorText);
			throw new RaindexMcpError(502, errorText);
		}

		return parseToolPayload(normalized);
	} catch (error) {
		if (error instanceof RaindexMcpError) {
			console.error('[raindex-mcp] RaindexMcpError: status=%d message=%s', error.status, error.message);
			throw error;
		}

		console.error('[raindex-mcp] unexpected error in callTool(%s): %s', toolName, error instanceof Error ? error.stack ?? error.message : String(error));
		clientPromise = null;
		const message = error instanceof Error ? error.message : 'Failed to call Raindex MCP tool';
		throw new RaindexMcpError(502, message);
	}
}
