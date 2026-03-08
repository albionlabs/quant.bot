interface CacheEntry {
	data: Record<string, unknown>;
	expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

export function getCached(address: string): Record<string, unknown> | null {
	const key = address.toLowerCase();
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}

export function setCached(address: string, data: Record<string, unknown>): number {
	const key = address.toLowerCase();
	const expiresAt = Date.now() + TTL_MS;
	cache.set(key, { data, expiresAt });
	return expiresAt;
}

/** Recursively describe the shape of a value without including actual data. */
export function buildSchema(value: unknown): unknown {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'string') return 'string';
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';

	if (Array.isArray(value)) {
		const result: Record<string, unknown> = {
			_type: 'array',
			_length: value.length
		};
		if (value.length > 0) {
			result._itemShape = buildSchema(value[0]);
		}
		return result;
	}

	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const schema: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			schema[k] = buildSchema(v);
		}
		return schema;
	}

	return 'unknown';
}

/**
 * Extract specific dot-path fields from a data object.
 * e.g. paths=["asset.location", "payoutData"] returns those subtrees.
 */
export function extractFields(
	data: Record<string, unknown>,
	paths: string[]
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const path of paths) {
		const parts = path.split('.');
		let current: unknown = data;

		for (const part of parts) {
			if (current === null || current === undefined || typeof current !== 'object') {
				current = undefined;
				break;
			}
			current = (current as Record<string, unknown>)[part];
		}

		result[path] = current ?? null;
	}

	return result;
}

/** Clear the entire cache (useful for testing). */
export function clearCache(): void {
	cache.clear();
}
