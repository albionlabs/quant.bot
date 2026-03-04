import * as jose from 'jose';

const EXECUTION_TOKEN_TYPE = 'execution';

export async function createExecutionToken(
	userId: string,
	internalSecret: string,
	ttlSeconds: number
): Promise<string> {
	if (!internalSecret) {
		throw new Error('INTERNAL_SECRET is not configured');
	}

	const secret = new TextEncoder().encode(internalSecret);
	return new jose.SignJWT({ typ: EXECUTION_TOKEN_TYPE })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(userId)
		.setIssuedAt()
		.setExpirationTime(`${ttlSeconds}s`)
		.sign(secret);
}
