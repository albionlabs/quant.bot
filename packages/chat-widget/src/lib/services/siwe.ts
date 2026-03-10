export interface SiweParams {
	domain: string;
	address: string;
	uri: string;
	chainId: number;
	nonce: string;
	statement?: string;
}

export function createSiweMessage(params: SiweParams): string {
	const issuedAt = new Date().toISOString();

	// EIP-4361 format — must match exactly for siwe@3.x server-side parsing
	let message = `${params.domain} wants you to sign in with your Ethereum account:\n`;
	message += `${params.address}\n\n`;
	if (params.statement) {
		message += `${params.statement}\n\n`;
	}
	message += `URI: ${params.uri}\n`;
	message += `Version: 1\n`;
	message += `Chain ID: ${params.chainId}\n`;
	message += `Nonce: ${params.nonce}\n`;
	message += `Issued At: ${issuedAt}`;

	return message;
}

export function generateNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	for (const byte of bytes) {
		result += chars[byte % chars.length];
	}
	return result;
}
