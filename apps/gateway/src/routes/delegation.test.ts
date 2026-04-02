import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { delegationRoutes } from './delegation.js';
import { createToken } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';

vi.mock('../services/delegation-client.js', () => ({
	getDelegationStatus: vi.fn(),
	getDelegationById: vi.fn(),
	activateDelegation: vi.fn(),
	revokeDelegation: vi.fn(),
	getCredentials: vi.fn(),
	DelegationServiceError: class extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
}));

const config = {
	jwtSecret: 'test-secret-that-is-long-enough-for-hs256',
	jwtExpiry: '1h',
	delegationServiceUrl: 'https://delegation.test',
	internalSecret: 'test-internal-secret'
} as GatewayConfig;

const USER_ID = '0xabc123';
const USER_ADDRESS = '0xABC123';

async function getToken(userId = USER_ID, address = USER_ADDRESS): Promise<string> {
	return createToken(address, userId, config);
}

describe('delegation routes', () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify();
		await app.register((instance) => delegationRoutes(instance, config));
		vi.restoreAllMocks();
	});

	afterEach(async () => {
		await app.close();
	});

	describe('POST /api/auth/delegation/activate', () => {
		it('returns 401 without auth', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				payload: { delegationId: 'd1', walletAddress: '0x1' }
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns 400 when delegationId or walletAddress is missing', async () => {
			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				headers: { authorization: `Bearer ${token}` },
				payload: { delegationId: 'd1' }
			});
			expect(res.statusCode).toBe(400);
			expect(res.json().error).toBe('delegationId and walletAddress are required');
		});

		it('returns 403 when delegation belongs to different user', async () => {
			const { getDelegationById } = await import('../services/delegation-client.js');
			vi.mocked(getDelegationById).mockResolvedValue({
				id: 'd1',
				userId: '0xother-user',
				walletAddress: '0x1',
				status: 'active',
				chainId: 8453,
				expiresAt: Date.now() + 60_000
			} as any);

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				headers: { authorization: `Bearer ${token}` },
				payload: { delegationId: 'd1', walletAddress: '0x1' }
			});
			expect(res.statusCode).toBe(403);
			expect(res.json().error).toBe('Delegation does not belong to this user');
		});

		it('returns 404 when delegation not found', async () => {
			const { getDelegationById } = await import('../services/delegation-client.js');
			vi.mocked(getDelegationById).mockRejectedValue(new Error('not found'));

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				headers: { authorization: `Bearer ${token}` },
				payload: { delegationId: 'd1', walletAddress: '0x1' }
			});
			expect(res.statusCode).toBe(404);
		});

		it('activates delegation successfully', async () => {
			const { getDelegationById, activateDelegation } = await import('../services/delegation-client.js');
			vi.mocked(getDelegationById).mockResolvedValue({
				id: 'd1',
				userId: USER_ID,
				walletAddress: '0x1',
				status: 'active',
				chainId: 8453,
				expiresAt: Date.now() + 60_000
			} as any);
			vi.mocked(activateDelegation).mockResolvedValue({ activeDelegationId: 'd1' });

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				headers: { authorization: `Bearer ${token}` },
				payload: { delegationId: 'd1', walletAddress: '0x1' }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ activeDelegationId: 'd1' });
		});

		it('returns 400 when activation fails (expired/revoked)', async () => {
			const { getDelegationById, activateDelegation } = await import('../services/delegation-client.js');
			vi.mocked(getDelegationById).mockResolvedValue({
				id: 'd1',
				userId: USER_ID,
				walletAddress: '0x1',
				status: 'active',
				chainId: 8453,
				expiresAt: Date.now() + 60_000
			} as any);
			vi.mocked(activateDelegation).mockRejectedValue(new Error('expired'));

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/activate',
				headers: { authorization: `Bearer ${token}` },
				payload: { delegationId: 'd1', walletAddress: '0x1' }
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe('GET /api/auth/delegation/status', () => {
		it('returns delegation status for authenticated user', async () => {
			const { getDelegationStatus } = await import('../services/delegation-client.js');
			vi.mocked(getDelegationStatus).mockResolvedValue({
				active: true,
				hasCredentials: true,
				syncRequired: false
			} as any);

			const token = await getToken();
			const res = await app.inject({
				method: 'GET',
				url: '/api/auth/delegation/status',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().active).toBe(true);
		});
	});

	describe('POST /api/auth/delegation/revoke', () => {
		it('revokes delegation successfully', async () => {
			const { revokeDelegation } = await import('../services/delegation-client.js');
			vi.mocked(revokeDelegation).mockResolvedValue({ status: 'revoked' });

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/revoke',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().status).toBe('revoked');
		});

		it('returns 502 for non-DelegationServiceError', async () => {
			const { revokeDelegation } = await import('../services/delegation-client.js');
			vi.mocked(revokeDelegation).mockRejectedValue(new Error('network error'));

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/revoke',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(502);
			expect(res.json().error).toBe('Delegation service unavailable');
		});

		it('forwards DelegationServiceError status', async () => {
			const { revokeDelegation, DelegationServiceError } = await import('../services/delegation-client.js');
			vi.mocked(revokeDelegation).mockRejectedValue(
				new (DelegationServiceError as any)(404, 'Not found')
			);

			const token = await getToken();
			const res = await app.inject({
				method: 'POST',
				url: '/api/auth/delegation/revoke',
				headers: { authorization: `Bearer ${token}` }
			});
			expect(res.statusCode).toBe(404);
			expect(res.json().error).toBe('Not found');
		});
	});

	describe('POST /api/internal/delegation/credentials', () => {
		it('returns 401 without internal secret', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/internal/delegation/credentials',
				payload: { userId: USER_ID }
			});
			expect(res.statusCode).toBe(401);
		});

		it('returns 400 without userId', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/api/internal/delegation/credentials',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: {}
			});
			expect(res.statusCode).toBe(400);
		});

		it('returns credentials with valid internal secret', async () => {
			const { getCredentials } = await import('../services/delegation-client.js');
			vi.mocked(getCredentials).mockResolvedValue({
				walletId: 'w1',
				walletAddress: '0x1',
				walletApiKey: 'key',
				keyShare: '{}',
				chainId: 8453
			} as any);

			const res = await app.inject({
				method: 'POST',
				url: '/api/internal/delegation/credentials',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: { userId: USER_ID }
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().walletApiKey).toBe('key');
		});

		it('returns 404 when credentials not found', async () => {
			const { getCredentials } = await import('../services/delegation-client.js');
			vi.mocked(getCredentials).mockRejectedValue(new Error('not found'));

			const res = await app.inject({
				method: 'POST',
				url: '/api/internal/delegation/credentials',
				headers: { 'x-internal-secret': config.internalSecret },
				payload: { userId: USER_ID }
			});
			expect(res.statusCode).toBe(404);
		});
	});
});
