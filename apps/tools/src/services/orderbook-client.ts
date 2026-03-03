import type { ToolsConfig } from '../config.js';

export class OrderbookProxyError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'OrderbookProxyError';
		this.status = status;
	}
}

function authHeader(config: ToolsConfig): string {
	if (!config.orderbookApiKey || !config.orderbookApiSecret) {
		throw new OrderbookProxyError(
			503,
			'Orderbook API credentials are not configured on the tools service'
		);
	}

	return `Basic ${Buffer.from(`${config.orderbookApiKey}:${config.orderbookApiSecret}`).toString('base64')}`;
}

export async function requestOrderbook<TResponse>(
	config: ToolsConfig,
	method: 'GET' | 'POST',
	path: string,
	body?: unknown
): Promise<TResponse> {
	const res = await fetch(`${config.orderbookApiUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: authHeader(config)
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (!res.ok) {
		const errorJson = await res.json().catch(() => ({}));
		const message =
			(errorJson as { error?: string; message?: string }).error ??
			(errorJson as { error?: string; message?: string }).message ??
			`Orderbook API returned ${res.status}`;
		throw new OrderbookProxyError(res.status, message);
	}

	return res.json() as Promise<TResponse>;
}
