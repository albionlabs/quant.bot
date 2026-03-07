import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTokenMetadata } from './token-metadata.js';

// Build a minimal CBOR+pako encoded meta hex string for testing
async function buildMockMetaHex(
	payload: Record<string, unknown> = { name: 'Test Asset', location: 'Test Location' },
	options?: { deflate?: boolean; payloadAsHexString?: boolean; includeMagicPrefix?: boolean }
): Promise<string> {
	const { encode } = await import('cbor-x');
	const pako = await import('pako');

	const shouldDeflate = options?.deflate ?? true;
	const includeMagicPrefix = options?.includeMagicPrefix ?? true;
	const payloadBytes = shouldDeflate
		? Buffer.from(pako.deflate(JSON.stringify(payload)))
		: Buffer.from(JSON.stringify(payload), 'utf8');
	const encodedPayload = options?.payloadAsHexString
		? `0x${payloadBytes.toString('hex')}`
		: payloadBytes;

	const container = new Map<number, Uint8Array | string>();
	container.set(0, encodedPayload);

	const cborBytes = encode(container);

	// 8 bytes of rain meta document magic (0xff0a89c674ee7874)
	const magic = Buffer.from('ff0a89c674ee7874', 'hex');
	const full = includeMagicPrefix ? Buffer.concat([magic, cborBytes]) : cborBytes;

	return '0x' + full.toString('hex');
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('fetchTokenMetadata', () => {
	it('fetches and decodes metadata entries', async () => {
		const metaHex = await buildMockMetaHex();

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						metaV1S: [
							{
								id: 'meta-1',
								meta: metaHex,
								sender: '0xabc123',
								subject: '0x000000000000000000000000f836a500910453a397084ade41321ee20a5aade1',
								metaHash: '0xhash1',
								transaction: { timestamp: '1700000000' }
							}
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).not.toBeNull();
		expect(result.latest!.decodedData).toEqual({
			name: 'Test Asset',
			location: 'Test Location'
		});
		expect(result.latest!.timestamp).toBe(1700000000);
		expect(result.history).toHaveLength(1);
		expect(result.display).toContain('name: Test Asset');
		expect(result.display).toContain('location: Test Location');
	});

	it('returns null latest when no metadata exists', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({ data: { metaV1S: [] } }),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).toBeNull();
		expect(result.history).toHaveLength(0);
		expect(result.display).toBe('No metadata found.');
	});

	it('handles malformed CBOR gracefully', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						metaV1S: [
							{
								id: 'meta-bad',
								meta: '0xff0a89c674ee7874deadbeef',
								sender: '0xabc',
								subject: '0x000000000000000000000000f836a500910453a397084ade41321ee20a5aade1',
								metaHash: '0xhash2',
								transaction: { timestamp: '1700000000' }
							}
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).not.toBeNull();
		expect(result.latest!.decodedData).toBeNull();
	});

	it('converts dot-notation keys into nested objects', async () => {
		const metaHex = await buildMockMetaHex({
			'asset.name': 'Wressle-1',
			'asset.royalty.sharePercentage': 4.5
		});

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						metaV1S: [
							{
								id: 'meta-dot-keys',
								meta: metaHex,
								sender: '0xabc123',
								subject: '0x000000000000000000000000f836a500910453a397084ade41321ee20a5aade1',
								metaHash: '0xhash3',
								transaction: { timestamp: '1700000100' }
							}
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).not.toBeNull();
		expect(result.latest!.decodedData).toEqual({
			asset: {
				name: 'Wressle-1',
				royalty: {
					sharePercentage: 4.5
				}
			}
		});
	});

	it('decodes non-deflated payloads encoded as hex strings', async () => {
		const metaHex = await buildMockMetaHex(
			{ name: 'Wressle-1', royaltyPercentage: 4.5 },
			{ deflate: false, payloadAsHexString: true }
		);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						metaV1S: [
							{
								id: 'meta-plain-json',
								meta: metaHex,
								sender: '0xabc123',
								subject: '0x000000000000000000000000f836a500910453a397084ade41321ee20a5aade1',
								metaHash: '0xhash4',
								transaction: { timestamp: '1700000200' }
							}
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).not.toBeNull();
		expect(result.latest!.decodedData).toEqual({
			name: 'Wressle-1',
			royaltyPercentage: 4.5
		});
	});

	it('decodes metadata without the rain document magic prefix', async () => {
		const metaHex = await buildMockMetaHex(
			{ name: 'No Prefix Asset' },
			{ includeMagicPrefix: false }
		);

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					data: {
						metaV1S: [
							{
								id: 'meta-no-prefix',
								meta: metaHex,
								sender: '0xabc123',
								subject: '0x000000000000000000000000f836a500910453a397084ade41321ee20a5aade1',
								metaHash: '0xhash5',
								transaction: { timestamp: '1700000300' }
							}
						]
					}
				}),
				{ status: 200 }
			)
		);

		const result = await fetchTokenMetadata('0xf836a500910453A397084ADe41321ee20a5AAde1');
		expect(result.latest).not.toBeNull();
		expect(result.latest!.decodedData).toEqual({
			name: 'No Prefix Asset'
		});
	});
});
