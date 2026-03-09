import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ToolsConfig } from '../config.js';
import { patchSettingsRpc } from '../services/raindex-mcp-client.js';

interface CachedEntry {
	content: string;
	timestamp: number;
}

const cache = new Map<string, CachedEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchCached(url: string): Promise<string> {
	const cached = cache.get(url);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.content;
	}

	const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
	}

	const content = await response.text();
	cache.set(url, { content, timestamp: Date.now() });
	return content;
}


function parseLocalRegistry(content: string, toolsBaseUrl: string): string {
	const lines = content.split('\n');
	const result: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const parts = trimmed.split(/\s+/);
		if (parts.length < 2) continue;

		const [name, filename] = parts;
		const url = `${toolsBaseUrl}/api/strategies/files/${encodeURIComponent(filename!)}`;
		result.push(`${name} ${url}`);
	}

	return result.join('\n');
}

export async function customStrategiesRoutes(app: FastifyInstance, config: ToolsConfig) {
	const strategiesDir = config.customStrategiesDir;

	app.get<{ Params: { filename: string } }>(
		'/api/strategies/files/:filename',
		async (request, reply) => {
			const { filename } = request.params;

			if (!filename.endsWith('.rain') || filename.includes('..') || filename.includes('/')) {
				return reply.status(400).send({ error: 'Only .rain files are allowed' });
			}

			const safe = basename(filename);
			const filePath = join(strategiesDir, safe);

			try {
				const content = await readFile(filePath, 'utf-8');
				return reply.type('text/plain').send(content);
			} catch {
				return reply.status(404).send({ error: `Strategy file not found: ${safe}` });
			}
		}
	);

	// Serve the official settings YAML with the real RPC URL injected.
	// The SDK's DotrainRegistry fetches this via the first line of the registry.
	app.get('/api/strategies/settings.yaml', async (_request, reply) => {
		const settingsUrl = config.raindexSettingsUrl || config.raindexRegistryUrl.replace(/\/registry$/, '/settings.yaml');
		try {
			const yaml = await fetchCached(settingsUrl);
			const patched = patchSettingsRpc(yaml, config.rpcUrl);
			return reply.type('text/plain').send(patched);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'unknown error';
			app.log.error('Failed to serve patched settings: %s', message);
			return reply.status(502).send({ error: message });
		}
	});

	app.get('/api/strategies/registry', async (_request, reply) => {
		let official = '';
		let officialError: string | null = null;
		try {
			official = await fetchCached(config.raindexRegistryUrl);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'unknown error';
			officialError = message;
			app.log.error('Failed to fetch official registry: %s', message);
		}

		let localEntries = '';
		try {
			const localRegistry = await readFile(join(strategiesDir, 'registry'), 'utf-8');
			localEntries = parseLocalRegistry(localRegistry, config.toolsBaseUrl);
		} catch {
			// No local registry or empty — that's fine
		}

		const parts: string[] = [];
		if (official.trim()) parts.push(official.trimEnd());
		if (localEntries) parts.push(localEntries);

		if (parts.length === 0) {
			if (officialError) {
				return reply.status(502).send({ error: `Failed to fetch official registry: ${officialError}` });
			}
			return reply.status(502).send({ error: 'No strategies available: empty official and local registries' });
		}

		let merged = parts.join('\n') + '\n';

		// Rewrite the first line (settings URL) to point to our patched settings
		// so the SDK's DotrainRegistry gets real RPC URLs instead of public ones.
		const localSettingsUrl = `${config.toolsBaseUrl}/api/strategies/settings.yaml`;
		merged = merged.replace(/^https?:\/\/\S+/, localSettingsUrl);

		return reply.type('text/plain').send(merged);
	});
}
