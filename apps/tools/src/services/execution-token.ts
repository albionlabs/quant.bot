import { createHmac, timingSafeEqual } from 'node:crypto';

const EXECUTION_TOKEN_TYPE = 'execution';

interface ExecutionTokenHeader {
	alg?: string;
	typ?: string;
}

interface ExecutionTokenPayload {
	typ?: string;
	sub?: string;
	exp?: number;
	nbf?: number;
	iat?: number;
}

function decodeBase64UrlJson<T>(input: string): T {
	const json = Buffer.from(input, 'base64url').toString('utf8');
	return JSON.parse(json) as T;
}

function verifyHs256Signature(token: string, secret: string): ExecutionTokenPayload {
	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new Error('Invalid execution token format');
	}

	const [headerB64, payloadB64, signatureB64] = parts;
	const header = decodeBase64UrlJson<ExecutionTokenHeader>(headerB64);
	if (header.alg !== 'HS256') {
		throw new Error('Invalid execution token algorithm');
	}

	const signingInput = `${headerB64}.${payloadB64}`;
	const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
	const providedSig = Buffer.from(signatureB64, 'base64url');

	if (expectedSig.length !== providedSig.length) {
		throw new Error('Invalid execution token signature');
	}
	if (!timingSafeEqual(expectedSig, providedSig)) {
		throw new Error('Invalid execution token signature');
	}

	return decodeBase64UrlJson<ExecutionTokenPayload>(payloadB64);
}

export async function resolveUserIdFromExecutionToken(
	executionToken: string,
	internalSecret: string
): Promise<string> {
	if (!internalSecret) {
		throw new Error('INTERNAL_SECRET is not configured');
	}

	const payload = verifyHs256Signature(executionToken, internalSecret);

	if (payload.typ !== EXECUTION_TOKEN_TYPE) {
		throw new Error('Invalid execution token type');
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
		throw new Error('Execution token expired');
	}
	if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) {
		throw new Error('Execution token not active yet');
	}

	if (typeof payload.sub !== 'string' || !payload.sub) {
		throw new Error('Execution token missing subject');
	}

	return payload.sub.toLowerCase();
}
