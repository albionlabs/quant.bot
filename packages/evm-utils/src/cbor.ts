import { decode } from 'cbor-x';

export interface ContractMetadata {
	solc?: string;
	sources?: Record<string, { keccak256: string }>;
	bzzr0?: Uint8Array;
	bzzr1?: Uint8Array;
	ipfs?: Uint8Array;
	experimental?: boolean;
}

/**
 * Extract and decode CBOR metadata from deployed contract bytecode.
 * The last 2 bytes of EVM bytecode encode the length of the CBOR metadata section.
 */
export function decodeCBORMetadata(bytecode: string): ContractMetadata | null {
	const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
	const bytes = Buffer.from(hex, 'hex');

	if (bytes.length < 2) return null;

	const metadataLength = bytes.readUInt16BE(bytes.length - 2);

	if (metadataLength + 2 > bytes.length) return null;

	const metadataBytes = bytes.subarray(bytes.length - 2 - metadataLength, bytes.length - 2);

	try {
		return decode(metadataBytes) as ContractMetadata;
	} catch {
		return null;
	}
}

export function formatCBORMetadata(metadata: ContractMetadata): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	if (metadata.solc) {
		result.compiler = `solc@${metadata.solc}`;
	}
	if (metadata.ipfs) {
		result.ipfsHash = Buffer.from(metadata.ipfs).toString('hex');
	}
	if (metadata.bzzr0) {
		result.swarmHash = Buffer.from(metadata.bzzr0).toString('hex');
	}
	if (metadata.bzzr1) {
		result.swarmHash = Buffer.from(metadata.bzzr1).toString('hex');
	}
	if (metadata.sources) {
		result.sources = Object.keys(metadata.sources);
	}

	return result;
}
