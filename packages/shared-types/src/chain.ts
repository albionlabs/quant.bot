export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type Hex = `0x${string}`;

export interface TxRequest {
	to: Address;
	data?: Hex;
	value?: bigint;
	gas?: bigint;
}

export interface TxReceipt {
	transactionHash: Hash;
	blockNumber: bigint;
	status: 'success' | 'reverted';
	gasUsed: bigint;
}
