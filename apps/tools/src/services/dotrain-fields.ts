import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

interface FieldDef {
	name: string;
	description: string;
	default?: string;
}

interface SelectTokenDef {
	name: string;
	description: string;
}

export interface DotrainDeployment {
	key: string;
	name: string;
	description: string;
	fields: Record<string, FieldDef>;
	selectTokens: Record<string, SelectTokenDef>;
	deposits: string[];
}

export interface DotrainGui {
	name: string;
	description: string;
	deployments: DotrainDeployment[];
}

function parseGui(gui: Record<string, unknown>): DotrainGui {
	const result: DotrainGui = {
		name: typeof gui.name === 'string' ? gui.name : '',
		description: typeof gui.description === 'string' ? gui.description : '',
		deployments: []
	};

	const deployments = gui.deployments;
	if (!deployments || typeof deployments !== 'object' || Array.isArray(deployments)) {
		return result;
	}

	for (const [key, dep] of Object.entries(deployments as Record<string, unknown>)) {
		if (!dep || typeof dep !== 'object' || Array.isArray(dep)) continue;
		const d = dep as Record<string, unknown>;

		const fields: Record<string, FieldDef> = {};
		if (Array.isArray(d.fields)) {
			for (const f of d.fields) {
				if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
				const field = f as Record<string, unknown>;
				const binding = typeof field.binding === 'string' ? field.binding : '';
				if (!binding) continue;
				fields[binding] = {
					name: typeof field.name === 'string' ? field.name : binding,
					description: typeof field.description === 'string' ? field.description : '',
					...(field.default !== undefined ? { default: String(field.default) } : {})
				};
			}
		}

		const selectTokens: Record<string, SelectTokenDef> = {};
		const rawTokens = d['select-tokens'];
		if (Array.isArray(rawTokens)) {
			for (const t of rawTokens) {
				if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
				const token = t as Record<string, unknown>;
				const tokenKey = typeof token.key === 'string' ? token.key : '';
				if (!tokenKey) continue;
				selectTokens[tokenKey] = {
					name: typeof token.name === 'string' ? token.name : tokenKey,
					description: typeof token.description === 'string' ? token.description : ''
				};
			}
		}

		const deposits: string[] = [];
		if (Array.isArray(d.deposits)) {
			for (const dep of d.deposits) {
				if (typeof dep === 'string') {
					deposits.push(dep);
				} else if (dep && typeof dep === 'object' && !Array.isArray(dep)) {
					const obj = dep as Record<string, unknown>;
					const token = typeof obj.token === 'string' ? obj.token : '';
					if (token) deposits.push(token);
				}
			}
		}

		result.deployments.push({
			key,
			name: typeof d.name === 'string' ? d.name : key,
			description: typeof d.description === 'string' ? d.description : '',
			fields,
			selectTokens,
			deposits
		});
	}

	return result;
}

export function parseDotrainYaml(source: string): DotrainGui | null {
	const separator = source.indexOf('\n---');
	const yamlPart = separator >= 0 ? source.slice(0, separator) : source;

	let parsed: unknown;
	try {
		parsed = parseYaml(yamlPart);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

	const root = parsed as Record<string, unknown>;
	const gui = root.gui;
	if (!gui || typeof gui !== 'object' || Array.isArray(gui)) return null;

	return parseGui(gui as Record<string, unknown>);
}

export async function loadRegistryMap(strategiesDir: string): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	try {
		const content = await readFile(join(strategiesDir, 'registry'), 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const parts = trimmed.split(/\s+/);
			if (parts.length >= 2) {
				map.set(parts[0]!, parts[1]!);
			}
		}
	} catch {
		// No registry file
	}
	return map;
}

export async function getDotrainGui(
	strategiesDir: string,
	strategyKey: string
): Promise<DotrainGui | null> {
	const registryMap = await loadRegistryMap(strategiesDir);
	const filename = registryMap.get(strategyKey);
	if (!filename) return null;

	const safe = basename(filename);
	if (!safe.endsWith('.rain')) return null;

	try {
		const content = await readFile(join(strategiesDir, safe), 'utf-8');
		return parseDotrainYaml(content);
	} catch {
		return null;
	}
}
