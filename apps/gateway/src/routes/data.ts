import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
	NpvRequest,
	NpvResponse,
	OrderbookResponse,
	TokenLookupResponse,
	TokenMetadataResponse,
	TradeHistoryResponse
} from '@quant-bot/shared-types';
import { authMiddleware } from '../middleware/auth.js';
import type { GatewayConfig } from '../config.js';

async function forwardErrorOrJson<T>(upstream: Response, reply: FastifyReply): Promise<T | void> {
	if (!upstream.ok) {
		const body = (await upstream.json().catch(() => ({ error: 'Unknown error' }))) as {
			error?: string;
		};
		return reply.status(upstream.status).send(body);
	}
	return (await upstream.json()) as T;
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== '') {
			search.set(key, value);
		}
	}
	const encoded = search.toString();
	return encoded ? `${path}?${encoded}` : path;
}

export async function dataProxyRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.get<{ Params: { symbolOrAddress: string } }>('/api/data/tokens/:symbolOrAddress', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const { symbolOrAddress } = request.params;
			const response = await fetch(
				`${config.toolsBaseUrl}/api/tokens/${encodeURIComponent(symbolOrAddress)}`
			);
			return forwardErrorOrJson<TokenLookupResponse>(response, reply);
		}
	});

	app.get<{ Params: { address: string }; Querystring: { limit?: string } }>(
		'/api/data/token-metadata/:address',
		{
			preHandler: authMiddleware(config),
			handler: async (request, reply) => {
				const { address } = request.params;
				const path = withQuery(`/api/tokens/${encodeURIComponent(address)}/metadata`, {
					limit: request.query.limit
				});
				const response = await fetch(`${config.toolsBaseUrl}${path}`);
				return forwardErrorOrJson<TokenMetadataResponse>(response, reply);
			}
		}
	);

	app.get<{ Params: { tokenAddress: string }; Querystring: { side?: string; detail?: string } }>(
		'/api/data/orderbook/:tokenAddress',
		{
			preHandler: authMiddleware(config),
			handler: async (request, reply) => {
				const { tokenAddress } = request.params;
				const path = withQuery(`/api/exchange/orderbook/${encodeURIComponent(tokenAddress)}`, {
					side: request.query.side,
					detail: request.query.detail
				});
				const response = await fetch(`${config.toolsBaseUrl}${path}`);
				return forwardErrorOrJson<OrderbookResponse>(response, reply);
			}
		}
	);

	app.get<{ Params: { tokenAddress: string }; Querystring: { limit?: string; detail?: string } }>(
		'/api/data/trades/:tokenAddress',
		{
			preHandler: authMiddleware(config),
			handler: async (request, reply) => {
				const { tokenAddress } = request.params;
				const path = withQuery(`/api/exchange/trades/${encodeURIComponent(tokenAddress)}`, {
					limit: request.query.limit,
					detail: request.query.detail
				});
				const response = await fetch(`${config.toolsBaseUrl}${path}`);
				return forwardErrorOrJson<TradeHistoryResponse>(response, reply);
			}
		}
	);

	app.post<{ Body: NpvRequest }>('/api/data/npv', {
		preHandler: authMiddleware(config),
		handler: async (request, reply) => {
			const response = await fetch(`${config.toolsBaseUrl}/api/npv`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request.body)
			});
			return forwardErrorOrJson<NpvResponse>(response, reply);
		}
	});
}
