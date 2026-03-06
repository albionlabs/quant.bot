import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireNonEmpty } from '@quant-bot/shared-types';

export interface ToolsConfig {
	port: number;
	host: string;
	rpcUrl: string;
	chainName: string;
	internalSecret: string;
	raindexMcpCommand: string;
	raindexMcpArgs: string[];
	raindexMcpCwd: string;
	raindexSettingsPath: string;
	raindexSettingsYaml: string;
	raindexSettingsUrl: string;
	raindexRegistryUrl: string;
}

const DEFAULT_RAIN_STRATEGIES_COMMIT = '2c8192e9137736507041ebff820b0e7b5b29f0d2';
const DEFAULT_RAINDEX_SETTINGS_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${DEFAULT_RAIN_STRATEGIES_COMMIT}/settings.yaml`;
const DEFAULT_RAINDEX_REGISTRY_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${DEFAULT_RAIN_STRATEGIES_COMMIT}/registry`;

function commandBasename(command: string): string {
	const parts = command.trim().split(/[\\/]/);
	return parts[parts.length - 1]!.toLowerCase();
}

function validateMcpEntrypoint(command: string, args: string[], cwd: string): void {
	if (commandBasename(command) !== 'node') return;

	const entrypoint = args.find((arg) => arg.trim() && !arg.startsWith('-'));
	if (!entrypoint) {
		throw new Error('RAINDEX_MCP_ARGS must include a node entrypoint when RAINDEX_MCP_COMMAND=node');
	}

	const resolvedEntrypoint = entrypoint.startsWith('/')
		? entrypoint
		: resolve(cwd || process.cwd(), entrypoint);
	if (!existsSync(resolvedEntrypoint)) {
		throw new Error(
			`RAINDEX MCP entrypoint not found at "${resolvedEntrypoint}". ` +
				'Set RAINDEX_MCP_ARGS to a valid built server path.'
		);
	}
}

function parseArgs(raw: string): string[] {
	if (!raw.trim()) return [];

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
			throw new Error('RAINDEX_MCP_ARGS must be a JSON array of strings');
		}
		return parsed;
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'invalid JSON';
		throw new Error(`Invalid RAINDEX_MCP_ARGS: ${reason}`, {
			cause: error
		});
	}
}

export function loadConfig(): ToolsConfig {
	const raindexMcpArgs = parseArgs(process.env.RAINDEX_MCP_ARGS ?? '[]');
	const configuredSettingsPath = (process.env.RAINDEX_SETTINGS_PATH ?? '').trim();
	const configuredSettingsYaml = (process.env.RAINDEX_SETTINGS_YAML ?? '').trim();
	const configuredSettingsUrl = (process.env.RAINDEX_SETTINGS_URL ?? '').trim();
	const configuredSources = [
		['RAINDEX_SETTINGS_PATH', configuredSettingsPath],
		['RAINDEX_SETTINGS_YAML', configuredSettingsYaml],
		['RAINDEX_SETTINGS_URL', configuredSettingsUrl]
	].filter(([, value]) => value !== '');

	if (configuredSources.length > 1) {
		console.warn(
			`[tools-config] Multiple Raindex settings sources are set (${configuredSources.map(([name]) => name).join(', ')}). ` +
				'Using precedence: RAINDEX_SETTINGS_YAML > RAINDEX_SETTINGS_URL > RAINDEX_SETTINGS_PATH.'
		);
	}

	// Precedence: RAINDEX_SETTINGS_YAML > RAINDEX_SETTINGS_URL > RAINDEX_SETTINGS_PATH
	let raindexSettingsYaml = '';
	let raindexSettingsUrl = '';
	let raindexSettingsPath = '';
	if (configuredSettingsYaml) {
		raindexSettingsYaml = configuredSettingsYaml;
	} else if (configuredSettingsUrl) {
		raindexSettingsUrl = configuredSettingsUrl;
	} else if (configuredSettingsPath) {
		raindexSettingsPath = configuredSettingsPath;
	} else {
		raindexSettingsUrl = DEFAULT_RAINDEX_SETTINGS_URL;
	}

	const config: ToolsConfig = {
		port: parseInt(process.env.TOOLS_PORT ?? '4000', 10),
		host: process.env.TOOLS_HOST ?? '0.0.0.0',
		rpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
		chainName: process.env.CHAIN_NAME ?? 'base',
		internalSecret: process.env.INTERNAL_SECRET ?? '',
		raindexMcpCommand: process.env.RAINDEX_MCP_COMMAND ?? '',
		raindexMcpArgs,
		raindexMcpCwd: process.env.RAINDEX_MCP_CWD ?? '',
		raindexSettingsPath,
		raindexSettingsYaml,
		raindexSettingsUrl,
		raindexRegistryUrl: (process.env.RAINDEX_REGISTRY_URL ?? '').trim() || DEFAULT_RAINDEX_REGISTRY_URL
	};

	requireNonEmpty('INTERNAL_SECRET', config.internalSecret);
	requireNonEmpty('RAINDEX_MCP_COMMAND', config.raindexMcpCommand);

	if (!config.raindexSettingsPath && !config.raindexSettingsYaml && !config.raindexSettingsUrl) {
		throw new Error('Set one of RAINDEX_SETTINGS_PATH, RAINDEX_SETTINGS_YAML, or RAINDEX_SETTINGS_URL');
	}

	if (config.raindexSettingsPath) {
		const resolvedSettingsPath = config.raindexSettingsPath.startsWith('/')
			? config.raindexSettingsPath
			: resolve(process.cwd(), config.raindexSettingsPath);
		if (!existsSync(resolvedSettingsPath)) {
			throw new Error(`RAINDEX_SETTINGS_PATH not found at "${resolvedSettingsPath}"`);
		}
	}

	validateMcpEntrypoint(config.raindexMcpCommand, config.raindexMcpArgs, config.raindexMcpCwd);

	return config;
}
