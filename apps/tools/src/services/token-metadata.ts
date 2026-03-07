import { decodeMultiple } from 'cbor-x';
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

/**
 * Decode a CBOR+pako metadata payload from the subgraph.
 *
 * Pipeline:
 * 1. Strip 18-char prefix (0x + 16 hex chars of rain meta doc magic)
 * 2. Buffer.from(hex, 'hex') -> decodeMultiple() from cbor-x
 * 3. First Map item: key 0 -> pako.inflate(payload, { to: 'string' }) -> JSON.parse
 */
function decodeMeta(metaHex: string): Record<string, unknown> | null {
	try {
		// Strip "0x" prefix + 16 hex chars (8 bytes) of rain meta document magic
		const stripped = metaHex.slice(18);
		const bytes = Buffer.from(stripped, 'hex');

		const decoded = decodeMultiple(bytes) as unknown[];
		if (!decoded || decoded.length === 0) return null;

		const container = decoded[0];
		if (!(container instanceof Map)) return null;

		const payload = (container as Map<unknown, unknown>).get(0);
		if (!payload) return null;

		const inflated = pako.inflate(payload as Uint8Array, { to: 'string' });
		const parsed: unknown = JSON.parse(inflated);
		if (typeof parsed === 'object' && parsed !== null) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch (error) {
		console.warn('[token-metadata] Failed to decode meta:', error);
		return null;
	}
}

export async function fetchTokenMetadata(tokenAddress: string): Promise<{
	latest: DecodedMetaEntry | null;
	history: DecodedMetaEntry[];
}> {
	const paddedSubject = `0x000000000000000000000000${tokenAddress.slice(2).toLowerCase()}`;

	const data = await executeGraphQL<MetaV1SQueryResult>(
		METADATA_SUBGRAPH,
		METADATA_QUERY,
		{ subject: paddedSubject }
	);

	const entries: DecodedMetaEntry[] = data.metaV1S.map((raw) => ({
		id: raw.id,
		metaHash: raw.metaHash,
		sender: raw.sender,
		subject: raw.subject,
		decodedData: raw.meta ? decodeMeta(raw.meta) : null,
		timestamp: raw.transaction?.timestamp
			? parseInt(raw.transaction.timestamp)
			: undefined
	}));

	return {
		latest: entries[0] ?? null,
		history: entries
	};
}
