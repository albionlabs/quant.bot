import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ToolsConfig } from '../config.js';

let cachedOfficialRegistry: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchOfficialRegistry(url: string): Promise<string> {
	const now = Date.now();
	if (cachedOfficialRegistry !== null && now - cacheTimestamp < CACHE_TTL_MS) {
		return cachedOfficialRegistry;
	}

	const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
	if (!response.ok) {
		throw new Error(`Failed to fetch official registry: HTTP ${response.status}`);
	}

	cachedOfficialRegistry = await response.text();
	cacheTimestamp = now;
	return cachedOfficialRegistry;
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

	app.get('/api/strategies/registry', async (_request, reply) => {
		let official = '';
		try {
			official = await fetchOfficialRegistry(config.raindexRegistryUrl);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'unknown error';
			app.log.error('Failed to fetch official registry: %s', message);
			return reply.status(502).send({ error: `Failed to fetch official registry: ${message}` });
		}

		let localEntries = '';
		try {
			const localRegistry = await readFile(join(strategiesDir, 'registry'), 'utf-8');
			localEntries = parseLocalRegistry(localRegistry, config.toolsBaseUrl);
		} catch {
			// No local registry or empty — that's fine
		}

		const parts = [official.trimEnd()];
		if (localEntries) parts.push(localEntries);
		const merged = parts.join('\n') + '\n';

		return reply.type('text/plain').send(merged);
	});
}
