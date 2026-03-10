import { writable, get } from 'svelte/store';
import type { DisplayMessage } from '../types.js';
import type { ClientMessage, ServerMessage } from '@quant-bot/shared-types';
import {
	fetchNpv,
	fetchOrderbook,
	fetchTokenMetadata,
	fetchTrades,
	lookupToken,
	setGatewayConfig
} from '../services/gateway-api.js';

export interface ChatState {
	messages: DisplayMessage[];
	connected: boolean;
	reconnecting: boolean;
	sessionId: string | null;
	loading: boolean;
	thinkingStatus: string | null;
	backendVersion: string | null;
}

const initial: ChatState = {
	messages: [],
	connected: false,
	reconnecting: false,
	sessionId: null,
	loading: false,
	thinkingStatus: null,
	backendVersion: null
};

export const chat = writable<ChatState>(initial);

let ws: WebSocket | null = null;
let messageCounter = 0;
let streamingAssistantMessageId: string | null = null;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastGatewayUrl: string | null = null;
let lastToken: string | null = null;
let lastApiKey: string | null = null;
let intentionalClose = false;

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

function getReconnectDelay(): number {
	const delay = Math.min(
		BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
		MAX_RECONNECT_DELAY_MS
	);
	// Add jitter (±25%) to avoid thundering herd
	return delay * (0.75 + Math.random() * 0.5);
}

function scheduleReconnect() {
	if (intentionalClose || !lastGatewayUrl || !lastToken) return;
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (intentionalClose || !lastGatewayUrl || !lastToken) return;
		reconnectAttempts++;
		connectInternal(lastGatewayUrl, lastToken);
	}, getReconnectDelay());
}

function clearReconnectTimer() {
	if (reconnectTimer !== null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function connectInternal(gatewayUrl: string, token: string) {
	if (ws) {
		ws.onclose = null;
		ws.onerror = null;
		ws.close();
	}

	chat.update((s) => ({ ...s, reconnecting: true }));

	let url = `${gatewayUrl}/api/chat?token=${encodeURIComponent(token)}`;
	if (lastApiKey) {
		url += `&apiKey=${encodeURIComponent(lastApiKey)}`;
	}
	ws = new WebSocket(url);

	ws.onopen = () => {
		// Don't reset reconnectAttempts here – wait for the server's 'connected'
		// message which confirms the agent is reachable. Otherwise the backoff
		// resets on every TCP-level open and AGENT_UNAVAILABLE causes a tight loop.
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data) as ServerMessage;

			if (msg.type === 'connected') {
				reconnectAttempts = 0;
				chat.update((s) => ({
					...s,
					connected: true,
					reconnecting: false,
					backendVersion: msg.version ?? null
				}));
				return;
			}

			if (msg.type === 'progress' && msg.status) {
				chat.update((s) => ({
					...s,
					thinkingStatus: msg.status ?? null,
					sessionId: msg.sessionId ?? s.sessionId,
					loading: true
				}));
			} else if (msg.type === 'stream' && msg.delta) {
				chat.update((s) => {
					const messages = [...s.messages];
					const now = Date.now();
					const delta = msg.delta ?? '';
					const idx = streamingAssistantMessageId
						? messages.findIndex((m) => m.id === streamingAssistantMessageId)
						: -1;

					if (idx >= 0) {
						messages[idx] = {
							...messages[idx],
							content: `${messages[idx].content}${delta}`,
							timestamp: now
						};
					} else {
						streamingAssistantMessageId = `msg-${++messageCounter}`;
						messages.push({
							id: streamingAssistantMessageId,
							role: 'assistant',
							content: delta,
							timestamp: now
						});
					}

					return {
						...s,
						messages,
						thinkingStatus: null,
						sessionId: msg.sessionId ?? s.sessionId,
						loading: true
					};
				});
			} else if (msg.type === 'message' && msg.content) {
				chat.update((s) => {
					const role = msg.role ?? 'assistant';
					const now = Date.now();
					let messages: DisplayMessage[];

					if (!streamingAssistantMessageId) {
						messages = [
							...s.messages,
							{
								id: `msg-${++messageCounter}`,
								role,
								content: msg.content ?? '',
								timestamp: now
							}
						];
					} else {
						messages = s.messages.map((m) =>
							m.id === streamingAssistantMessageId
								? { ...m, role, content: msg.content ?? m.content, timestamp: now }
								: m
						);
					}

					return { ...s, messages, sessionId: msg.sessionId ?? s.sessionId, loading: false, thinkingStatus: null };
				});
				streamingAssistantMessageId = null;
			} else if (msg.type === 'error') {
				// AGENT_UNAVAILABLE is sent right before the server closes the
				// socket; the client will auto-reconnect so don't spam the UI.
				if (msg.code === 'AGENT_UNAVAILABLE') return;

				const hint = msg.code === 'AGENT_ERROR'
					? ' You can retry by sending your message again.'
					: '';
				const errorMsg: DisplayMessage = {
					id: `msg-${++messageCounter}`,
					role: 'system',
					content: `Error: ${msg.message ?? 'Unknown error'}${hint}`,
					timestamp: Date.now()
				};
				chat.update((s) => ({
					...s,
					messages: [...s.messages, errorMsg],
					loading: false,
					thinkingStatus: null
				}));
				streamingAssistantMessageId = null;
			}
		} catch {
			// ignore parse errors
		}
	};

	ws.onclose = () => {
		chat.update((s) => ({ ...s, connected: false, reconnecting: false, loading: false }));
		ws = null;
		streamingAssistantMessageId = null;
		scheduleReconnect();
	};

	ws.onerror = () => {
		chat.update((s) => ({ ...s, connected: false, reconnecting: false }));
	};
}

export function connect(gatewayUrl: string, token: string, apiKey?: string) {
	intentionalClose = false;
	reconnectAttempts = 0;
	lastGatewayUrl = gatewayUrl;
	lastToken = token;
	lastApiKey = apiKey ?? null;
	setGatewayConfig(gatewayUrl, token, apiKey);
	clearReconnectTimer();
	connectInternal(gatewayUrl, token);

	// Reconnect when the browser regains network or tab visibility
	if (typeof window !== 'undefined') {
		window.addEventListener('online', reconnectIfDisconnected);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	}
}

export function reconnect() {
	if (!lastGatewayUrl || !lastToken) return;
	reconnectAttempts = 0;
	clearReconnectTimer();
	connectInternal(lastGatewayUrl, lastToken);
}

function reconnectIfDisconnected() {
	if (intentionalClose) return;
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		reconnectAttempts = 0;
		clearReconnectTimer();
		if (lastGatewayUrl && lastToken) {
			connectInternal(lastGatewayUrl, lastToken);
		}
	}
}

function handleVisibilityChange() {
	if (document.visibilityState === 'visible') {
		reconnectIfDisconnected();
	}
}

function appendMessage(role: DisplayMessage['role'], content: string): void {
	const displayMsg: DisplayMessage = {
		id: `msg-${++messageCounter}`,
		role,
		content,
		timestamp: Date.now()
	};
	chat.update((s) => ({ ...s, messages: [...s.messages, displayMsg] }));
}

type DirectCommand =
	| { kind: 'token'; query: string }
	| { kind: 'orderbook'; tokenAddress: string; side: 'buy' | 'sell' | 'both' }
	| { kind: 'trades'; tokenAddress: string; limit: number }
	| { kind: 'metadata'; tokenAddress: string; limit: number }
	| { kind: 'npv'; discountRate: number; cashFlows: number[] }
	| { kind: 'help' };

function parseSide(value: string | undefined): 'buy' | 'sell' | 'both' {
	const normalized = (value ?? 'both').toLowerCase();
	if (normalized === 'buy' || normalized === 'bid') return 'buy';
	if (normalized === 'sell' || normalized === 'ask') return 'sell';
	return 'both';
}

function parseDirectCommand(content: string): DirectCommand | null {
	const trimmed = content.trim();
	if (!trimmed.startsWith('/')) return null;
	const parts = trimmed.split(/\s+/);
	const command = parts[0]?.toLowerCase();

	switch (command) {
		case '/token':
			return parts[1] ? { kind: 'token', query: parts[1] } : { kind: 'help' };
		case '/orderbook':
			return parts[1]
				? {
						kind: 'orderbook',
						tokenAddress: parts[1],
						side: parseSide(parts[2])
					}
				: { kind: 'help' };
		case '/trades': {
			if (!parts[1]) return { kind: 'help' };
			const parsedLimit = parts[2] ? parseInt(parts[2], 10) : 20;
			const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;
			return { kind: 'trades', tokenAddress: parts[1], limit };
		}
		case '/metadata': {
			if (!parts[1]) return { kind: 'help' };
			const parsedLimit = parts[2] ? parseInt(parts[2], 10) : 1;
			const limit = Number.isFinite(parsedLimit) ? parsedLimit : 1;
			return { kind: 'metadata', tokenAddress: parts[1], limit };
		}
		case '/npv': {
			if (parts.length < 4) return { kind: 'help' };
			const discountRate = Number(parts[1]);
			const cashFlows = parts.slice(2).map((value) => Number(value));
			if (!Number.isFinite(discountRate) || cashFlows.some((value) => !Number.isFinite(value))) {
				return { kind: 'help' };
			}
			return { kind: 'npv', discountRate, cashFlows };
		}
		case '/help':
			return { kind: 'help' };
		default:
			return null;
	}
}

function directCommandHelpText(): string {
	return [
		'Direct commands (LLM bypass):',
		'/token <symbol|address>',
		'/orderbook <tokenAddress> [buy|sell|both]',
		'/trades <tokenAddress> [limit]',
		'/metadata <tokenAddress> [limit]',
		'/npv <discountRate> <cashFlow1> <cashFlow2> ...'
	].join('\n');
}

async function executeDirectCommand(command: DirectCommand): Promise<string> {
	switch (command.kind) {
		case 'help':
			return directCommandHelpText();
		case 'token': {
			const response = await lookupToken(command.query);
			const { token } = response;
			return `Token: ${token.symbol} (${token.name})\nAddress: ${token.address}\nDecimals: ${token.decimals}`;
		}
		case 'orderbook': {
			const response = await fetchOrderbook(command.tokenAddress, command.side);
			return [
				`Orderbook (${command.side}) ${response.tokenAddress}`,
				`Best bid: ${response.bestBid ?? 'n/a'}`,
				`Best ask: ${response.bestAsk ?? 'n/a'}`,
				`Spread: ${response.spread ?? 'n/a'}`,
				`Counts: bids=${response.bidCount}, asks=${response.askCount}`
			].join('\n');
		}
		case 'trades': {
			const response = await fetchTrades(command.tokenAddress, command.limit);
			return `Trades ${response.tokenAddress}: total=${response.total}\n${response.display}`;
		}
		case 'metadata': {
			const response = await fetchTokenMetadata(command.tokenAddress, command.limit);
			const decoded = response.latest?.decodedData;
			const preview =
				decoded && typeof decoded === 'object'
					? Object.entries(decoded)
							.slice(0, 6)
							.map(([key, value]) => `${key}: ${String(value)}`)
							.join('\n')
					: 'No decoded metadata available.';
			return `Metadata ${response.address}\n${preview}`;
		}
		case 'npv': {
			const response = await fetchNpv(command.cashFlows, command.discountRate);
			return `NPV=${response.npv}${response.irr !== undefined ? `, IRR=${response.irr}` : ''}`;
		}
		default:
			return 'Unsupported command.';
	}
}

export function sendMessage(content: string) {
	const trimmed = content.trim();
	if (!trimmed) return;
	streamingAssistantMessageId = null;

	appendMessage('user', trimmed);
	chat.update((s) => ({ ...s, loading: true }));

	const directCommand = parseDirectCommand(trimmed);
	if (directCommand) {
		void executeDirectCommand(directCommand)
			.then((result) => {
				appendMessage('assistant', result);
			})
			.catch((error) => {
				appendMessage(
					'system',
					`Error: ${error instanceof Error ? error.message : 'Request failed'}`
				);
			})
			.finally(() => {
				chat.update((s) => ({ ...s, loading: false }));
			});
		return;
	}

	if (!ws || ws.readyState !== WebSocket.OPEN) {
		appendMessage('system', 'Error: Chat connection is not available');
		chat.update((s) => ({ ...s, loading: false }));
		return;
	}

	const state = get(chat);
	const msg: ClientMessage = {
		type: 'message',
		content: trimmed,
		sessionId: state.sessionId ?? undefined
	};

	ws.send(JSON.stringify(msg));
}

export function disconnect() {
	intentionalClose = true;
	clearReconnectTimer();
	if (typeof window !== 'undefined') {
		window.removeEventListener('online', reconnectIfDisconnected);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	}
	if (ws) {
		ws.close();
		ws = null;
	}
	streamingAssistantMessageId = null;
	lastGatewayUrl = null;
	lastToken = null;
	lastApiKey = null;
	reconnectAttempts = 0;
	chat.set(initial);
}
