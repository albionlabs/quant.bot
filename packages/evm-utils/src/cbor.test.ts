import { describe, it, expect } from 'vitest';
import { encode } from 'cbor-x';
import { decodeCBORMetadata, formatCBORMetadata } from './cbor.js';

function buildBytecodeWithCBOR(metadata: Record<string, unknown>): string {
	const cborBytes = encode(metadata);
	const lengthBuf = Buffer.alloc(2);
	lengthBuf.writeUInt16BE(cborBytes.length);
	// Prepend some fake bytecode, append CBOR + length
	const fakeBytecode = Buffer.from('6080604052', 'hex');
	const full = Buffer.concat([fakeBytecode, cborBytes, lengthBuf]);
	return '0x' + full.toString('hex');
}

describe('decodeCBORMetadata', () => {
	it('decodes valid CBOR metadata from bytecode', () => {
		const bytecode = buildBytecodeWithCBOR({ solc: '0.8.19' });
		const result = decodeCBORMetadata(bytecode);
		expect(result).not.toBeNull();
		expect(result!.solc).toBe('0.8.19');
	});

	it('handles bytecode without 0x prefix', () => {
		const bytecode = buildBytecodeWithCBOR({ solc: '0.8.20' });
		const result = decodeCBORMetadata(bytecode.slice(2));
		expect(result).not.toBeNull();
		expect(result!.solc).toBe('0.8.20');
	});

	it('returns null for bytecode too short', () => {
		expect(decodeCBORMetadata('0x')).toBeNull();
		expect(decodeCBORMetadata('0xff')).toBeNull();
	});

	it('returns null when metadata length exceeds bytecode', () => {
		// Create bytecode where the last 2 bytes claim a larger metadata section than exists
		const buf = Buffer.alloc(4);
		buf.writeUInt16BE(9999, 2); // claim 9999 bytes of metadata
		expect(decodeCBORMetadata('0x' + buf.toString('hex'))).toBeNull();
	});

	it('returns null for invalid CBOR data', () => {
		// Create bytecode where the "CBOR" section is garbage
		const garbageMetadata = Buffer.from('deadbeef', 'hex');
		const lengthBuf = Buffer.alloc(2);
		lengthBuf.writeUInt16BE(garbageMetadata.length);
		const full = Buffer.concat([garbageMetadata, lengthBuf]);
		expect(decodeCBORMetadata('0x' + full.toString('hex'))).toBeNull();
	});
});

describe('formatCBORMetadata', () => {
	it('formats solc compiler version', () => {
		const result = formatCBORMetadata({ solc: '0.8.19' });
		expect(result.compiler).toBe('solc@0.8.19');
	});

	it('formats ipfs hash', () => {
		const ipfsBytes = new Uint8Array([1, 2, 3, 4]);
		const result = formatCBORMetadata({ ipfs: ipfsBytes });
		expect(result.ipfsHash).toBe('01020304');
	});

	it('formats bzzr0 swarm hash', () => {
		const swarmBytes = new Uint8Array([0xaa, 0xbb]);
		const result = formatCBORMetadata({ bzzr0: swarmBytes });
		expect(result.swarmHash).toBe('aabb');
	});

	it('formats bzzr1 swarm hash (overrides bzzr0)', () => {
		const result = formatCBORMetadata({
			bzzr0: new Uint8Array([0x01]),
			bzzr1: new Uint8Array([0x02])
		});
		expect(result.swarmHash).toBe('02');
	});

	it('formats sources as list of keys', () => {
		const result = formatCBORMetadata({
			sources: {
				'contracts/Token.sol': { keccak256: '0xabc' },
				'contracts/Lib.sol': { keccak256: '0xdef' }
			}
		});
		expect(result.sources).toEqual(['contracts/Token.sol', 'contracts/Lib.sol']);
	});

	it('returns empty object for empty metadata', () => {
		expect(formatCBORMetadata({})).toEqual({});
	});
});
