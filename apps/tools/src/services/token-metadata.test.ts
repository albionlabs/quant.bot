import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTokenMetadata } from './token-metadata.js';

// Build a minimal CBOR+pako encoded meta hex string for testing
async function buildMockMetaHex(): Promise<string> {
	const { encode } = await import('cbor-x');
	const pako = await import('pako');

	const payload = { name: 'Test Asset', location: 'Test Location' };
	const compressed = pako.deflate(JSON.stringify(payload));

	const container = new Map<number, Uint8Array>();
	container.set(0, compressed);

	const cborBytes = encode(container);

	// 8 bytes of rain meta document magic (0xff0a89c674ee7874)
	const magic = Buffer.from('ff0a89c674ee7874', 'hex');
	const full = Buffer.concat([magic, cborBytes]);

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
});
