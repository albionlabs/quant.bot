import type { ToolsConfig } from '../config.js';

export class OrderbookProxyError extends Error {
	status: number;
	upstreamPath?: string;

	constructor(status: number, message: string, upstreamPath?: string) {
		super(message);
		this.name = 'OrderbookProxyError';
		this.status = status;
		this.upstreamPath = upstreamPath;
	}
}

function extractErrorMessage(payload: unknown, status: number): string {
	const defaultMessage = `Orderbook API returned ${status}`;
	if (!payload || typeof payload !== 'object') return defaultMessage;

	const raw = payload as {
		error?: unknown;
		message?: unknown;
		code?: unknown;
	};

	if (typeof raw.message === 'string' && raw.message.trim()) return raw.message;

	if (typeof raw.error === 'string' && raw.error.trim()) return raw.error;

	if (raw.error && typeof raw.error === 'object') {
		const nested = raw.error as { code?: unknown; message?: unknown };
		const nestedCode = typeof nested.code === 'string' ? nested.code : null;
		const nestedMessage = typeof nested.message === 'string' ? nested.message : null;
		if (nestedCode && nestedMessage) return `${nestedCode}: ${nestedMessage}`;
		if (nestedMessage) return nestedMessage;
	}

	return defaultMessage;
}

function authHeader(config: ToolsConfig): string | null {
	const hasKey = Boolean(config.orderbookApiKey);
	const hasSecret = Boolean(config.orderbookApiSecret);

	if (hasKey !== hasSecret) {
		throw new OrderbookProxyError(
			503,
			'Orderbook API auth is misconfigured: set both ORDERBOOK_API_KEY and ORDERBOOK_API_SECRET'
		);
	}

	if (!hasKey) {
		return null;
	}

	return `Basic ${Buffer.from(`${config.orderbookApiKey}:${config.orderbookApiSecret}`).toString('base64')}`;
}

export async function requestOrderbook<TResponse>(
	config: ToolsConfig,
	method: 'GET' | 'POST',
	path: string,
	body?: unknown
): Promise<TResponse> {
	const auth = authHeader(config);

	const res = await fetch(`${config.orderbookApiUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(auth ? { Authorization: auth } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});

	if (!res.ok) {
		const rawBody = await res.text().catch(() => '');
		let errorPayload: unknown = null;
		if (rawBody) {
			try {
				errorPayload = JSON.parse(rawBody) as unknown;
			} catch {
				errorPayload = { message: rawBody };
			}
		}
		const message = extractErrorMessage(errorPayload, res.status);
		throw new OrderbookProxyError(res.status, message, path);
	}

	return res.json() as Promise<TResponse>;
}
