import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ToolsConfig } from '../config.js';
import { requestOrderbook, OrderbookProxyError } from '../services/orderbook-client.js';

interface RequestBody {
	[key: string]: unknown;
}

function handleOrderbookError(reply: FastifyReply, err: unknown) {
	if (err instanceof OrderbookProxyError) {
		const message = err.message.toLowerCase();
		const upstreamPath = err.upstreamPath ?? '';

		// Upstream legacy handlers currently panic for these strategy endpoints.
		// Return a deterministic guidance error so agent flows pivot to /api/order/custom.
		if (
			err.status === 500 &&
			(upstreamPath === '/v1/order/dca' || upstreamPath === '/v1/order/solver') &&
			message.includes('failed to initialize client runtime')
		) {
			return reply.status(501).send({
				error: 'Upstream DCA/Solver strategy endpoints are unavailable. Use /api/order/custom.',
				source: 'orderbook-api',
				upstreamPath
			});
		}

		// If custom is missing upstream, surface a concrete deployment/config hint.
		if (err.status === 404 && upstreamPath === '/v1/order/custom') {
			return reply.status(503).send({
				error: 'Upstream custom strategy endpoint is unavailable. Ensure albion.rest.api is deployed with /v1/order/custom support.',
				source: 'orderbook-api',
				upstreamPath
			});
		}

		return reply.status(err.status).send({
			error: err.message,
			source: 'orderbook-api',
			...(upstreamPath ? { upstreamPath } : {})
		});
	}
	const message = err instanceof Error ? err.message : 'Orderbook request failed';
	return reply.status(500).send({ error: message });
}

async function forwardOrderbook(
	reply: FastifyReply,
	config: ToolsConfig,
	method: 'GET' | 'POST',
	path: string,
	body?: unknown
) {
	try {
		return await requestOrderbook<Record<string, unknown>>(config, method, path, body);
	} catch (err) {
		return handleOrderbookError(reply, err);
	}
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value) params.set(key, value);
	}
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}

export async function orderbookRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.get('/api/tokens', async (_request, reply) =>
		forwardOrderbook(reply, config, 'GET', '/v1/tokens')
	);

	app.post<{ Body: RequestBody }>('/api/swap/quote', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/swap/quote', request.body)
	);

	app.post<{ Body: RequestBody }>('/api/swap/calldata', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/swap/calldata', request.body)
	);

	app.get<{
		Params: { address: string };
		Querystring: { page?: string; pageSize?: string; startTime?: string; endTime?: string };
	}>('/api/trades/:address', async (request, reply) => {
		const path = withQuery(`/v1/trades/${encodeURIComponent(request.params.address)}`, {
			page: request.query.page,
			pageSize: request.query.pageSize,
			startTime: request.query.startTime,
			endTime: request.query.endTime
		});
		return forwardOrderbook(reply, config, 'GET', path);
	});

	app.get<{ Params: { txHash: string } }>('/api/trades/tx/:txHash', async (request, reply) =>
		forwardOrderbook(reply, config, 'GET', `/v1/trades/tx/${encodeURIComponent(request.params.txHash)}`)
	);

	app.post<{ Body: RequestBody }>('/api/order/solver', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/order/solver', request.body)
	);

	app.post<{ Body: RequestBody }>('/api/order/custom', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/order/custom', request.body)
	);

	app.post<{ Body: RequestBody }>('/api/order/dca', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/order/dca', request.body)
	);

	app.get<{ Params: { orderHash: string } }>('/api/order/:orderHash', async (request, reply) =>
		forwardOrderbook(reply, config, 'GET', `/v1/order/${encodeURIComponent(request.params.orderHash)}`)
	);

	app.post<{ Body: RequestBody }>('/api/order/cancel', async (request, reply) =>
		forwardOrderbook(reply, config, 'POST', '/v1/order/cancel', request.body)
	);

	app.get<{
		Params: { address: string };
		Querystring: { page?: string; pageSize?: string };
	}>('/api/orders/address/:address', async (request, reply) => {
		const path = withQuery(`/v1/orders/${encodeURIComponent(request.params.address)}`, {
			page: request.query.page,
			pageSize: request.query.pageSize
		});
		return forwardOrderbook(reply, config, 'GET', path);
	});

	app.get<{ Params: { txHash: string } }>('/api/orders/tx/:txHash', async (request, reply) =>
		forwardOrderbook(reply, config, 'GET', `/v1/orders/tx/${encodeURIComponent(request.params.txHash)}`)
	);
}
