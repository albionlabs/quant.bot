import * as jose from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayConfig } from '../config.js';

export interface JwtPayload {
	sub: string;
	address: string;
	iat: number;
	exp: number;
}

export async function createToken(
	address: string,
	userId: string,
	config: GatewayConfig
): Promise<string> {
	const secret = new TextEncoder().encode(config.jwtSecret);
	return new jose.SignJWT({ address })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(userId)
		.setIssuedAt()
		.setExpirationTime(config.jwtExpiry)
		.sign(secret);
}

export async function verifyToken(token: string, config: GatewayConfig): Promise<JwtPayload> {
	const secret = new TextEncoder().encode(config.jwtSecret);
	const { payload } = await jose.jwtVerify(token, secret);
	return payload as unknown as JwtPayload;
}

export function authMiddleware(config: GatewayConfig) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const authHeader = request.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			return reply.status(401).send({ error: 'Missing or invalid authorization header' });
		}

		const token = authHeader.slice(7);
		try {
			const payload = await verifyToken(token, config);
			(request as FastifyRequest & { user: JwtPayload }).user = payload;
		} catch {
			return reply.status(401).send({ error: 'Invalid or expired token' });
		}
	};
}
