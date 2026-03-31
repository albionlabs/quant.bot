import { GatewayClient } from 'openclaw/plugin-sdk/gateway-runtime';
import type { EventFrame } from 'openclaw/plugin-sdk/gateway-runtime';
import { randomUUID } from 'crypto';
import type { GatewayConfig } from '../config.js';
import { TokenUsageAccumulator, estimateTokens } from './token-usage.js';

let client: GatewayClient | null = null;
let connected = false;
let savedConfig: GatewayConfig | null = null;

interface AgentEventData {
	runId: string;
	stream: string;
	data: Record<string, unknown>;
	seq: number;
	ts: number;
}

type AgentEventHandler = (event: AgentEventData) => void;
const runHandlers = new Map<string, AgentEventHandler>();

export function isAgentConnected(): boolean {
	return connected;
}

export function connectToAgent(config: GatewayConfig): Promise<void> {
	savedConfig = config;

	return new Promise<void>((resolve, reject) => {
		// GatewayClient auto-creates device identity via loadOrCreateDeviceIdentity()
		// when the deviceIdentity option is omitted (not null).
		client = new GatewayClient({
			url: config.agentWsUrl,
			token: config.openclawGatewayToken,
			clientName: 'gateway-client',
			clientDisplayName: 'Quant Bot Gateway',
			clientVersion: '1.0.0',
			platform: process.platform,
			mode: 'backend',
			role: 'operator',
			scopes: ['operator.admin'],
			caps: ['tool-events'],
			minProtocol: 3,
			maxProtocol: 3,
			onHelloOk: () => {
				connected = true;
				console.log('[agent-proxy] connected to openclaw agent (GatewayClient)');
				resolve();
			},
			onConnectError: (err) => {
				connected = false;
				console.error('[agent-proxy] connect error:', err.message);
				reject(err);
			},
			onEvent: (evt: EventFrame) => {
				if (evt.event === 'agent' && evt.payload) {
					const payload = evt.payload as AgentEventData;
					const handler = runHandlers.get(payload.runId);
					if (handler) handler(payload);
				}
			},
			onClose: (code, reason) => {
				connected = false;
				console.log(`[agent-proxy] disconnected (${code}: ${reason})`);
			}
		});

		client.start();
	});
}

export function disconnectAgent(): void {
	if (client) {
		client.stop();
		client = null;
		connected = false;
	}
}

export interface SendOptions {
	message: string;
	userId: string;
	sessionId: string;
	onDelta?: (delta: string) => void;
	onProgress?: (progress: string) => void;
	onToolCall?: (name: string, args: Record<string, unknown>) => void;
	onToolResult?: (name: string, result: unknown) => void;
	onError?: (error: string) => void;
	onUsage?: (usage: AgentRunUsage) => void;
	timeoutMs?: number;
}

export interface AgentRunUsage {
	status: 'completed' | 'timeout' | 'error';
	promptChars: number;
	completionChars: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	providerInputTokens: number;
	providerOutputTokens: number;
	providerTotalTokens: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	modelCalls: number;
	usageEvents: number;
	toolCalls: Record<string, number>;
	streamCounts: Record<string, number>;
}

export function sendToAgent(opts: SendOptions): Promise<string> {
	if (!connected || !client) {
		return Promise.reject(new Error('Agent not connected'));
	}

	const activeClient = client;
	const sessionKey = `agent:main:web:${opts.userId}:${opts.sessionId}`;

	return new Promise<string>((resolve, reject) => {
		const reqId = randomUUID();
		let timeout: ReturnType<typeof setTimeout> | null = null;
		const idleTimeoutMs = opts.timeoutMs ?? 120_000;
		const ERROR_IDLE_TIMEOUT_MS = 15_000;
		const usageAccumulator = new TokenUsageAccumulator();
		const estimatedInputTokens = estimateTokens(opts.message);
		let usageReported = false;
		let runId: string | null = null;
		let finalText = '';
		let lastError: string | null = null;
		let lastProgress: string | null = null;

		const reportUsage = (status: AgentRunUsage['status']) => {
			if (usageReported) return;
			usageReported = true;

			const summary = usageAccumulator.summarize();
			const estimatedOutputTokens = estimateTokens(finalText);
			const providerInputTokens = summary.providerInputTokens;
			const providerOutputTokens = summary.providerOutputTokens;
			const providerTotalTokens = summary.providerTotalTokens;
			const inputTokens = providerInputTokens > 0 ? providerInputTokens : estimatedInputTokens;
			const outputTokens = providerOutputTokens > 0 ? providerOutputTokens : estimatedOutputTokens;
			const totalTokens =
				providerTotalTokens > 0 ? providerTotalTokens : inputTokens + outputTokens;

			if (opts.onUsage) {
				opts.onUsage({
					status,
					promptChars: opts.message.length,
					completionChars: finalText.length,
					inputTokens,
					outputTokens,
					totalTokens,
					providerInputTokens,
					providerOutputTokens,
					providerTotalTokens,
					estimatedInputTokens,
					estimatedOutputTokens,
					modelCalls: summary.modelCalls,
					usageEvents: summary.usageEvents,
					toolCalls: summary.toolCalls,
					streamCounts: summary.streamCounts
				});
			}
		};

		const cleanup = () => {
			if (timeout) clearTimeout(timeout);
			if (runId) runHandlers.delete(runId);
		};

		const resetIdleTimeout = (customMs?: number) => {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => {
				cleanup();
				const status = lastError ? 'error' as const : 'timeout' as const;
				reportUsage(status);
				reject(new Error(lastError
					? `Agent error: ${lastError}`
					: 'Agent response timeout'));
			}, customMs ?? idleTimeoutMs);
		};
		resetIdleTimeout();

		const onAgentEvent = (event: AgentEventData) => {
			usageAccumulator.addEvent(event.stream, event.data);

			const isLifecycleError =
				event.stream === 'lifecycle' && event.data?.phase === 'error';

			if (isLifecycleError && typeof event.data?.error === 'string') {
				lastError = event.data.error;
				if (opts.onError) opts.onError(event.data.error);
			}

			resetIdleTimeout(isLifecycleError ? ERROR_IDLE_TIMEOUT_MS : undefined);

			// Text streaming
			if (event.stream === 'assistant' && event.data) {
				const delta = event.data.delta as string | undefined;
				if (delta && opts.onDelta) opts.onDelta(delta);
				if (event.data.text) finalText = event.data.text as string;
			}

			// Tool call events
			if (event.stream === 'tool_call' || (event.data?.toolName && event.stream !== 'assistant')) {
				const toolName =
					typeof event.data?.toolName === 'string' ? event.data.toolName
					: typeof event.data?.name === 'string' ? event.data.name
					: null;

				if (toolName && opts.onToolCall) {
					const args = (event.data?.args ?? event.data?.input ?? {}) as Record<string, unknown>;
					opts.onToolCall(toolName, args);
				}
			}

			// Tool result events
			if (event.stream === 'tool_result' && opts.onToolResult) {
				const toolName =
					typeof event.data?.toolName === 'string' ? event.data.toolName
					: typeof event.data?.name === 'string' ? event.data.name
					: 'unknown';
				opts.onToolResult(toolName, event.data?.result ?? event.data?.output ?? null);
			}

			// Progress updates for non-assistant streams
			if (event.stream !== 'assistant' && opts.onProgress) {
				const lifecyclePhase =
					event.stream === 'lifecycle' && typeof event.data?.phase === 'string'
						? event.data.phase
						: null;
				const errorDetail =
					isLifecycleError && typeof event.data?.error === 'string'
						? event.data.error
						: null;
				const toolName =
					typeof event.data?.toolName === 'string'
						? event.data.toolName
						: typeof event.data?.name === 'string'
							? event.data.name
							: null;

				let progress: string;
				if (errorDetail) {
					progress = `Error: ${errorDetail}`;
				} else if (lifecyclePhase === 'start' || lifecyclePhase === 'init') {
					progress = 'Thinking\u2026';
				} else if (lifecyclePhase === 'planning') {
					progress = 'Planning\u2026';
				} else if (lifecyclePhase === 'executing') {
					progress = 'Working\u2026';
				} else if (lifecyclePhase) {
					progress = `${lifecyclePhase}\u2026`;
				} else if (toolName === 'exec') {
					progress = 'Calling tools\u2026';
				} else if (toolName) {
					progress = `Running ${toolName}\u2026`;
				} else if (event.stream === 'model') {
					progress = 'Thinking\u2026';
				} else {
					progress = 'Working\u2026';
				}

				if (progress !== lastProgress) {
					lastProgress = progress;
					opts.onProgress(progress);
				}
			}

			// Lifecycle end = completion
			if (event.stream === 'lifecycle' && event.data?.phase === 'end') {
				cleanup();
				reportUsage('completed');
				resolve(finalText);
			}
		};

		// Register a temporary handler for the chat.send response
		// which gives us the runId for event routing
		activeClient.request<{ runId?: string }>('chat.send', {
			message: opts.message,
			idempotencyKey: randomUUID(),
			sessionKey
		}).then((res) => {
			resetIdleTimeout();
			runId = res?.runId ?? null;
			if (runId) {
				runHandlers.set(runId, onAgentEvent);
			}
		}).catch((err) => {
			cleanup();
			reportUsage('error');
			reject(new Error(err instanceof Error ? err.message : 'chat.send failed'));
		});
	});
}
