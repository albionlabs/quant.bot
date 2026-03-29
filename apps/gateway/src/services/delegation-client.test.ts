import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DelegationServiceError,
	storeDelegationViaWebhook,
	revokeDelegationViaWebhook,
	getDelegationStatus,
	getDelegationById,
	activateDelegation,
	revokeDelegation,
	getCredentials
} from './delegation-client.js';

const config = {
	delegationServiceUrl: 'https://delegation.test',
	internalSecret: 'test-secret'
};

function mockFetchOk(data: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve(data)
	});
}

function mockFetchError(status: number, body: unknown) {
	return vi.fn().mockResolvedValue({
		ok: false,
		status,
		json: () => Promise.resolve(body)
	});
}

describe('delegation client', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', mockFetchOk({}));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('storeDelegationViaWebhook sends POST with payload and signature', async () => {
		const mockData = { delegationId: 'abc' };
		vi.stubGlobal('fetch', mockFetchOk(mockData));

		const result = await storeDelegationViaWebhook(config, { foo: 'bar' }, 'sig-123');
		expect(result).toEqual(mockData);

		const [url, options] = (fetch as any).mock.calls[0];
		expect(url).toBe('https://delegation.test/webhook/created');
		expect(options.method).toBe('POST');
		expect(options.headers['X-Internal-Secret']).toBe('test-secret');
		expect(options.headers['X-Dynamic-Signature-256']).toBe('sig-123');
		expect(JSON.parse(options.body)).toEqual({ foo: 'bar' });
	});

	it('revokeDelegationViaWebhook sends POST', async () => {
		vi.stubGlobal('fetch', mockFetchOk({ status: 'revoked' }));
		const result = await revokeDelegationViaWebhook(config, { walletId: 'w1' });
		expect(result).toEqual({ status: 'revoked' });
	});

	it('getDelegationStatus sends GET with encoded userId', async () => {
		const mockData = { active: true };
		vi.stubGlobal('fetch', mockFetchOk(mockData));
		await getDelegationStatus(config, 'user/special');

		const [url] = (fetch as any).mock.calls[0];
		expect(url).toBe('https://delegation.test/status/user%2Fspecial');
	});

	it('getDelegationById sends GET', async () => {
		const mockData = { id: 'del-1', userId: 'u1' };
		vi.stubGlobal('fetch', mockFetchOk(mockData));
		const result = await getDelegationById(config, 'del-1');
		expect(result).toEqual(mockData);
	});

	it('activateDelegation sends POST with body', async () => {
		vi.stubGlobal('fetch', mockFetchOk({ activeDelegationId: 'del-1' }));
		const result = await activateDelegation(config, 'user-1', 'del-1');
		expect(result).toEqual({ activeDelegationId: 'del-1' });

		const [, options] = (fetch as any).mock.calls[0];
		expect(JSON.parse(options.body)).toEqual({ userId: 'user-1', delegationId: 'del-1' });
	});

	it('revokeDelegation sends POST with userId', async () => {
		vi.stubGlobal('fetch', mockFetchOk({ status: 'revoked' }));
		const result = await revokeDelegation(config, 'user-1');
		expect(result).toEqual({ status: 'revoked' });
	});

	it('getCredentials sends GET', async () => {
		const creds = { walletApiKey: 'key', delegatedShare: '{}' };
		vi.stubGlobal('fetch', mockFetchOk(creds));
		const result = await getCredentials(config, 'user-1');
		expect(result).toEqual(creds);
	});

	it('throws DelegationServiceError on non-ok response', async () => {
		vi.stubGlobal('fetch', mockFetchError(404, { error: 'Not found' }));

		await expect(getDelegationStatus(config, 'user-1')).rejects.toThrow(DelegationServiceError);
		try {
			await getDelegationStatus(config, 'user-1');
		} catch (err) {
			expect(err).toBeInstanceOf(DelegationServiceError);
			expect((err as DelegationServiceError).status).toBe(404);
			expect((err as DelegationServiceError).message).toBe('Not found');
		}
	});

	it('throws DelegationServiceError with fallback message when no error body', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error('parse error'))
		}));

		await expect(getDelegationStatus(config, 'user-1')).rejects.toThrow('Delegation service returned 500');
	});

	it('does not send signature header when no signature provided', async () => {
		vi.stubGlobal('fetch', mockFetchOk({ delegationId: 'abc' }));
		await storeDelegationViaWebhook(config, {});

		const [, options] = (fetch as any).mock.calls[0];
		expect(options.headers['X-Dynamic-Signature-256']).toBeUndefined();
	});
});
