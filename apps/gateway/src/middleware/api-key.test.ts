import { describe, it, expect, vi } from 'vitest';
import { apiKeyMiddleware } from './api-key.js';
import type { GatewayConfig } from '../config.js';

function createMockRequest(apiKey?: string) {
	return {
		headers: apiKey ? { 'x-api-key': apiKey } : {}
	} as any;
}

function createMockReply() {
	const reply: any = {};
	reply.status = vi.fn().mockReturnValue(reply);
	reply.send = vi.fn().mockReturnValue(reply);
	return reply;
}

describe('apiKeyMiddleware', () => {
	const config = {
		apiKeys: ['valid-key-1', 'valid-key-2']
	} as GatewayConfig;

	const middleware = apiKeyMiddleware(config);

	it('allows request with valid API key', async () => {
		const request = createMockRequest('valid-key-1');
		const reply = createMockReply();

		const result = await middleware(request, reply);
		expect(reply.status).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	it('rejects request with invalid API key', async () => {
		const request = createMockRequest('wrong-key');
		const reply = createMockReply();

		await middleware(request, reply);
		expect(reply.status).toHaveBeenCalledWith(403);
		expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid or missing API key' });
	});

	it('rejects request with no API key header', async () => {
		const request = createMockRequest();
		const reply = createMockReply();

		await middleware(request, reply);
		expect(reply.status).toHaveBeenCalledWith(403);
	});

	it('accepts any valid key from the list', async () => {
		const request = createMockRequest('valid-key-2');
		const reply = createMockReply();

		const result = await middleware(request, reply);
		expect(reply.status).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});
});
