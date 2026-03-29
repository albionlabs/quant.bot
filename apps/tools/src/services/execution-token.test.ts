import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { resolveUserIdFromExecutionToken } from './execution-token.js';

const SECRET = 'test-internal-secret-for-execution';

async function createExecutionToken(sub: string, typ = 'execution'): Promise<string> {
	const secret = new TextEncoder().encode(SECRET);
	return new jose.SignJWT({ typ })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(secret);
}

describe('resolveUserIdFromExecutionToken', () => {
	it('resolves user id from valid token', async () => {
		const token = await createExecutionToken('0xABCDEF');
		const userId = await resolveUserIdFromExecutionToken(token, SECRET);
		expect(userId).toBe('0xabcdef');
	});

	it('lowercases the returned user id', async () => {
		const token = await createExecutionToken('0xAbCdEf');
		const userId = await resolveUserIdFromExecutionToken(token, SECRET);
		expect(userId).toBe('0xabcdef');
	});

	it('throws when internal secret is empty', async () => {
		const token = await createExecutionToken('0xuser');
		await expect(resolveUserIdFromExecutionToken(token, ''))
			.rejects.toThrow('INTERNAL_SECRET is not configured');
	});

	it('throws when token type is not execution', async () => {
		const token = await createExecutionToken('0xuser', 'other');
		await expect(resolveUserIdFromExecutionToken(token, SECRET))
			.rejects.toThrow('Invalid execution token type');
	});

	it('throws when token has no subject', async () => {
		const secret = new TextEncoder().encode(SECRET);
		const token = await new jose.SignJWT({ typ: 'execution' })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(secret);

		await expect(resolveUserIdFromExecutionToken(token, SECRET))
			.rejects.toThrow('Execution token missing subject');
	});

	it('throws when token is signed with wrong secret', async () => {
		const token = await createExecutionToken('0xuser');
		await expect(resolveUserIdFromExecutionToken(token, 'wrong-secret'))
			.rejects.toThrow('signature verification failed');
	});

	it('throws for expired token', async () => {
		const secret = new TextEncoder().encode(SECRET);
		const token = await new jose.SignJWT({ typ: 'execution' })
			.setProtectedHeader({ alg: 'HS256' })
			.setSubject('0xuser')
			.setIssuedAt()
			.setExpirationTime('0s')
			.sign(secret);

		await expect(resolveUserIdFromExecutionToken(token, SECRET))
			.rejects.toThrow('"exp" claim timestamp check failed');
	});
});
