import { decodeMultiple } from 'cbor-x';
import cbor from 'cbor-web';
import pako from 'pako';
import type { DecodedMetaEntry } from '@quant-bot/shared-types';
import { executeGraphQL } from './graphql-client.js';
import { METADATA_SUBGRAPH } from '../constants.js';

interface RawMetaV1S {
	id: string;
	meta: string;
	sender: string;
	subject: string;
	metaHash: string;
	transaction?: {
		timestamp: string;
	};
}

interface MetaV1SQueryResult {
	metaV1S: RawMetaV1S[];
}

const METADATA_QUERY = `
query MetadataForToken($subject: String!) {
  metaV1S(
    where: { subject: $subject }
    orderBy: transaction__timestamp
    orderDirection: desc
    first: 100
  ) {
    id
    meta
    sender
    subject
    metaHash
    transaction {
      timestamp
    }
  }
}
`;

const RAIN_META_DOCUMENT_PREFIX = 'ff0a89c674ee7874';

/** Convert a hex string (with or without 0x prefix) to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** Decode CBOR data with the same approach used by the metadata visualiser. */
function cborDecode(dataEncoded: Uint8Array | string): unknown {
	try {
		return cbor.decodeAllSync(dataEncoded);
	} catch (firstError) {
		if (typeof dataEncoded !== 'string') throw firstError;
		return cbor.decodeAllSync(hexToBytes(dataEncoded));
	}
}

/**
 * Decode metadata bytes: prefer inflate+JSON, fallback to plain UTF-8 JSON/text.
 * Mirrors the visualiser behaviour while handling older/non-deflated payloads.
 */
function bytesToMeta(bytes: unknown): unknown {
	let bytesArr: Uint8Array;

	if (bytes instanceof Uint8Array) {
		bytesArr = bytes;
	} else if (bytes instanceof ArrayBuffer) {
		bytesArr = new Uint8Array(bytes);
	} else if (typeof bytes === 'string') {
		bytesArr = hexToBytes(bytes);
	} else if (ArrayBuffer.isView(bytes)) {
		bytesArr = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	} else {
		throw new Error('invalid meta: input must be bytes-like');
	}

	let decoded: string;
	try {
		decoded = pako.inflate(bytesArr, { to: 'string' });
	} catch {
		decoded = new TextDecoder().decode(bytesArr);
	}

	try {
		return JSON.parse(decoded);
	} catch {
		return decoded;
	}
}

/**
 * Convert flat dot-notation keys into nested objects.
 * e.g. { "asset.location.country": "UK" } -> { asset: { location: { country: "UK" } } }
 */
function convertDotNotationToObject(input: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key of Object.keys(input)) {
		const value = input[key];
		const keyParts = key.split('.');

		let currentPart: Record<string, unknown> = result;
		for (let i = 0; i < keyParts.length; i++) {
			const part = keyParts[i];

			if (i === keyParts.length - 1) {
				currentPart[part] = value;
				break;
			}

			if (!currentPart[part] || typeof currentPart[part] !== 'object') {
				currentPart[part] = {};
			}

			currentPart = currentPart[part] as Record<string, unknown>;
		}
	}

	return result;
}

function normalizeMetaHex(metaHex: string): string | null {
	if (!metaHex) return null;
	const clean = metaHex.startsWith('0x') ? metaHex.slice(2) : metaHex;
	if (clean.length === 0 || clean.length % 2 !== 0) return null;
	return clean.startsWith(RAIN_META_DOCUMENT_PREFIX)
		? clean.slice(RAIN_META_DOCUMENT_PREFIX.length)
		: clean;
}

function getPayload(container: unknown): unknown {
	const unwrapped =
		typeof container === 'object' && container !== null && 'value' in container
			? (container as Record<string, unknown>).value
			: container;

	if (unwrapped instanceof Map) {
		return unwrapped.get(0) ?? unwrapped.get(BigInt(0));
	}
	if (typeof unwrapped === 'object' && unwrapped !== null) {
		const record = unwrapped as Record<string, unknown>;
		return record['0'] ?? record[0];
	}
	return undefined;
}

function decodeContainers(cborHex: string): unknown[] {
	try {
		const decoded = cborDecode(cborHex);
		if (Array.isArray(decoded)) return decoded;
		return [decoded];
	} catch {
		// Backward-compatibility fallback with existing decoder.
		const decoded = decodeMultiple(Buffer.from(cborHex, 'hex')) as unknown[];
		return Array.isArray(decoded) ? decoded : [];
	}
}

/**
 * Decode a CBOR metadata payload from the subgraph.
 *
 * Pipeline:
 * 1. Normalize and strip the rain meta document magic prefix if present
 * 2. Decode CBOR with cbor-web (fallback to cbor-x for compatibility)
 * 3. Extract payload from key 0 (handling tagged wrappers)
 * 4. Inflate+parse JSON with UTF-8 fallback
 */
function decodeMeta(metaHex: string): Record<string, unknown> | null {
	try {
		const stripped = normalizeMetaHex(metaHex);
		if (!stripped) return null;

		const decoded = decodeContainers(stripped);
		if (decoded.length === 0) return null;

		const container = decoded[0];
		const payload = getPayload(container);
		if (!payload) return null;

		const parsed = bytesToMeta(payload);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			const raw = parsed as Record<string, unknown>;
			const hasDotKeys = Object.keys(raw).some((k) => k.includes('.'));
			return hasDotKeys ? convertDotNotationToObject(raw) : raw;
		}
		return null;
	} catch (error) {
		console.warn('[token-metadata] Failed to decode meta:', error);
		return null;
	}
}

function truncateDecodedData(data: Record<string, unknown> | null): Record<string, unknown> | null {
	if (!data) return null;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string' && value.length > 2000) {
			result[key] = value.slice(0, 2000) + '...(truncated)';
		} else {
			result[key] = value;
		}
	}
	return result;
}

function buildDisplay(latest: DecodedMetaEntry | null): string {
	if (!latest || !latest.decodedData) return 'No metadata found.';

	const d = latest.decodedData;
	const fields = ['name', 'description', 'location', 'type', 'status', 'category'];
	const lines: string[] = [];
	for (const key of fields) {
		if (key in d && d[key] !== null && d[key] !== undefined) {
			const val = String(d[key]);
			lines.push(`${key}: ${val.length > 200 ? val.slice(0, 200) + '...' : val}`);
		}
	}

	// Include any other top-level keys not in the standard fields
	for (const [key, val] of Object.entries(d)) {
		if (fields.includes(key)) continue;
		if (val === null || val === undefined) continue;
		if (typeof val === 'object') {
			lines.push(`${key}: [object]`);
		} else {
			const s = String(val);
			lines.push(`${key}: ${s.length > 200 ? s.slice(0, 200) + '...' : s}`);
		}
	}

	return lines.length > 0 ? lines.join('\n') : 'Metadata present but no readable fields.';
}

/** Fetch raw (non-truncated) decoded metadata for a token address. */
export async function fetchRawTokenMetadata(
	tokenAddress: string
): Promise<Record<string, unknown> | null> {
	const paddedSubject = `0x000000000000000000000000${tokenAddress.slice(2).toLowerCase()}`;

	const data = await executeGraphQL<MetaV1SQueryResult>(
		METADATA_SUBGRAPH,
		METADATA_QUERY,
		{ subject: paddedSubject }
	);

	const latest = data.metaV1S[0];
	if (!latest?.meta) return null;

	return decodeMeta(latest.meta);
}

export async function fetchTokenMetadata(tokenAddress: string, limit = 1): Promise<{
	display: string;
	latest: DecodedMetaEntry | null;
	history: DecodedMetaEntry[];
}> {
	const paddedSubject = `0x000000000000000000000000${tokenAddress.slice(2).toLowerCase()}`;

	const data = await executeGraphQL<MetaV1SQueryResult>(
		METADATA_SUBGRAPH,
		METADATA_QUERY,
		{ subject: paddedSubject }
	);

	const entries: DecodedMetaEntry[] = data.metaV1S.slice(0, limit).map((raw) => ({
		id: raw.id,
		metaHash: raw.metaHash,
		sender: raw.sender,
		subject: raw.subject,
		decodedData: truncateDecodedData(raw.meta ? decodeMeta(raw.meta) : null),
		timestamp: raw.transaction?.timestamp
			? parseInt(raw.transaction.timestamp)
			: undefined
	}));

	const latest = entries[0] ?? null;

	return {
		display: buildDisplay(latest),
		latest,
		history: entries
	};
}
