import * as jose from 'jose';

const EXECUTION_TOKEN_TYPE = 'execution';

export async function resolveUserIdFromExecutionToken(
	executionToken: string,
	internalSecret: string
): Promise<string> {
	if (!internalSecret) {
		throw new Error('INTERNAL_SECRET is not configured');
	}

	const secret = new TextEncoder().encode(internalSecret);
	const { payload } = await jose.jwtVerify(executionToken, secret, {
		algorithms: ['HS256']
	});

	if (payload.typ !== EXECUTION_TOKEN_TYPE) {
		throw new Error('Invalid execution token type');
	}

	if (typeof payload.sub !== 'string' || !payload.sub) {
		throw new Error('Execution token missing subject');
	}

	return payload.sub.toLowerCase();
}
