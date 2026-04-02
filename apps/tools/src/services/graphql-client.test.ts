import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeGraphQL } from './graphql-client.js';

describe('executeGraphQL', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends POST with query and variables', async () => {
		const mockData = { orders: [] };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: mockData })
		}));

		const result = await executeGraphQL('https://api.test/graphql', '{ orders { id } }', { first: 10 });
		expect(result).toEqual(mockData);

		const [url, options] = (fetch as any).mock.calls[0];
		expect(url).toBe('https://api.test/graphql');
		expect(options.method).toBe('POST');
		expect(options.headers['Content-Type']).toBe('application/json');
		const body = JSON.parse(options.body);
		expect(body.query).toBe('{ orders { id } }');
		expect(body.variables).toEqual({ first: 10 });
	});

	it('throws on non-ok HTTP response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error'
		}));

		await expect(executeGraphQL('https://api.test/graphql', '{ bad }'))
			.rejects.toThrow('GraphQL request failed: 500 Internal Server Error');
	});

	it('throws on GraphQL errors in response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				errors: [
					{ message: 'Field "x" not found' },
					{ message: 'Syntax error' }
				]
			})
		}));

		await expect(executeGraphQL('https://api.test/graphql', '{ bad }'))
			.rejects.toThrow('GraphQL errors: Field "x" not found, Syntax error');
	});

	it('throws when response contains no data', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({})
		}));

		await expect(executeGraphQL('https://api.test/graphql', '{ empty }'))
			.rejects.toThrow('GraphQL response contained no data');
	});

	it('works without variables', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ data: { count: 5 } })
		}));

		const result = await executeGraphQL('https://api.test/graphql', '{ count }');
		expect(result).toEqual({ count: 5 });
	});
});
