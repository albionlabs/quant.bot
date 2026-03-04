import type { FastifyInstance } from 'fastify';
import type { ToolsConfig } from '../config.js';
import { requestOrderbook, OrderbookProxyError } from '../services/orderbook-client.js';

interface RequestBody {
	[key: string]: unknown;
}

function handleOrderbookError(reply: { status: (code: number) => { send: (payload: unknown) => unknown } }, err: unknown) {
	if (err instanceof OrderbookProxyError) {
		return reply.status(err.status).send({
			error: err.message,
			source: 'orderbook-api',
			...(err.upstreamPath ? { upstreamPath: err.upstreamPath } : {})
		});
	}
	const message = err instanceof Error ? err.message : 'Orderbook request failed';
	return reply.status(500).send({ error: message });
}

export async function orderbookRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.get('/api/tokens', async (_request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(config, 'GET', '/v1/tokens');
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/swap/quote', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/swap/quote',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/swap/calldata', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/swap/calldata',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.get<{
		Params: { address: string };
		Querystring: { page?: string; pageSize?: string; startTime?: string; endTime?: string };
	}>('/api/trades/:address', async (request, reply) => {
		try {
			const params = new URLSearchParams();
			if (request.query.page) params.set('page', request.query.page);
			if (request.query.pageSize) params.set('pageSize', request.query.pageSize);
			if (request.query.startTime) params.set('startTime', request.query.startTime);
			if (request.query.endTime) params.set('endTime', request.query.endTime);

			const qs = params.toString();
			const path = `/v1/trades/${encodeURIComponent(request.params.address)}${qs ? `?${qs}` : ''}`;
			return await requestOrderbook<Record<string, unknown>>(config, 'GET', path);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.get<{ Params: { txHash: string } }>('/api/trades/tx/:txHash', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'GET',
				`/v1/trades/tx/${encodeURIComponent(request.params.txHash)}`
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/order/solver', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/order/solver',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/order/custom', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/order/custom',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/order/dca', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/order/dca',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.get<{ Params: { orderHash: string } }>('/api/order/:orderHash', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'GET',
				`/v1/order/${encodeURIComponent(request.params.orderHash)}`
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.post<{ Body: RequestBody }>('/api/order/cancel', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'POST',
				'/v1/order/cancel',
				request.body
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.get<{
		Params: { address: string };
		Querystring: { page?: string; pageSize?: string };
	}>('/api/orders/address/:address', async (request, reply) => {
		try {
			const params = new URLSearchParams();
			if (request.query.page) params.set('page', request.query.page);
			if (request.query.pageSize) params.set('pageSize', request.query.pageSize);

			const qs = params.toString();
			const path = `/v1/orders/${encodeURIComponent(request.params.address)}${qs ? `?${qs}` : ''}`;
			return await requestOrderbook<Record<string, unknown>>(config, 'GET', path);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});

	app.get<{ Params: { txHash: string } }>('/api/orders/tx/:txHash', async (request, reply) => {
		try {
			return await requestOrderbook<Record<string, unknown>>(
				config,
				'GET',
				`/v1/orders/tx/${encodeURIComponent(request.params.txHash)}`
			);
		} catch (err) {
			return handleOrderbookError(reply, err);
		}
	});
}
