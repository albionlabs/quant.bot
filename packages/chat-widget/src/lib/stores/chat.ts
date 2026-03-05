import { writable, get } from 'svelte/store';
import type { DisplayMessage } from '../types.js';
import type { ClientMessage, ServerMessage } from '@quant-bot/shared-types';

export interface ChatState {
	messages: DisplayMessage[];
	connected: boolean;
	sessionId: string | null;
	loading: boolean;
	backendVersion: string | null;
}

const initial: ChatState = {
	messages: [],
	connected: false,
	sessionId: null,
	loading: false,
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

	const url = `${gatewayUrl}/api/chat?token=${encodeURIComponent(token)}`;
	ws = new WebSocket(url);

	ws.onopen = () => {
		reconnectAttempts = 0;
		chat.update((s) => ({ ...s, connected: true }));
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data) as ServerMessage;

			if (msg.type === 'connected') {
				chat.update((s) => ({ ...s, backendVersion: msg.version ?? null }));
				return;
			}

			if (msg.type === 'stream' && msg.delta) {
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

					return { ...s, messages, sessionId: msg.sessionId ?? s.sessionId, loading: false };
				});
				streamingAssistantMessageId = null;
			} else if (msg.type === 'error') {
				const errorMsg: DisplayMessage = {
					id: `msg-${++messageCounter}`,
					role: 'system',
					content: `Error: ${msg.message ?? 'Unknown error'}`,
					timestamp: Date.now()
				};
				chat.update((s) => ({
					...s,
					messages: [...s.messages, errorMsg],
					loading: false
				}));
				streamingAssistantMessageId = null;
			}
		} catch {
			// ignore parse errors
		}
	};

	ws.onclose = () => {
		chat.update((s) => ({ ...s, connected: false, loading: false }));
		ws = null;
		streamingAssistantMessageId = null;
		scheduleReconnect();
	};

	ws.onerror = () => {
		chat.update((s) => ({ ...s, connected: false }));
	};
}

export function connect(gatewayUrl: string, token: string) {
	intentionalClose = false;
	reconnectAttempts = 0;
	lastGatewayUrl = gatewayUrl;
	lastToken = token;
	clearReconnectTimer();
	connectInternal(gatewayUrl, token);

	// Reconnect when the browser regains network or tab visibility
	if (typeof window !== 'undefined') {
		window.addEventListener('online', reconnectIfDisconnected);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	}
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

export function sendMessage(content: string) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	streamingAssistantMessageId = null;

	const state = get(chat);
	const msg: ClientMessage = {
		type: 'message',
		content,
		sessionId: state.sessionId ?? undefined
	};

	ws.send(JSON.stringify(msg));

	const displayMsg: DisplayMessage = {
		id: `msg-${++messageCounter}`,
		role: 'user',
		content,
		timestamp: Date.now()
	};

	chat.update((s) => ({
		...s,
		messages: [...s.messages, displayMsg],
		loading: true
	}));
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
	reconnectAttempts = 0;
	chat.set(initial);
}
