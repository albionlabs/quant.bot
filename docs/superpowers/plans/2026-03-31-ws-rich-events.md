# WebSocket Rich Events Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken HTTP SSE agent proxy with OpenClaw's `GatewayClient` (which handles device-identity auth and preserves operator scopes), then forward rich agent events (tool calls, lifecycle phases, errors) through the gateway to the chat widget.

**Architecture:** The gateway's `agent-proxy.ts` switches from raw `ws` + HTTP fetch to OpenClaw's `GatewayClient` class (`openclaw/plugin-sdk`). This class auto-generates Ed25519 device identity, signs challenge nonces, and preserves `operator.admin` scope — fixing the root cause of `chat.send` scope failures. The `GatewayClient.onEvent` callback receives `AgentEvent` frames which the gateway maps to expanded `ServerMessage` types and forwards to the widget over WebSocket. The widget store handles new message types (`tool_call`, `tool_result`, `thinking`) and the UI renders them.

**Tech Stack:** OpenClaw plugin-sdk (`GatewayClient`, `loadOrCreateDeviceIdentity`), Fastify 5, ws, Svelte 5, TypeScript 5.9

**Root cause (for context):** OpenClaw deliberately clears all operator scopes for WebSocket connections authenticated with a shared token but **no device identity**. The raw `ws` implementation never sent device identity, so scopes were wiped to `[]`, and `chat.send` (which requires `operator.write`) failed. OpenClaw's `GatewayClient` class auto-creates device identity, solving this.

---

## File Structure

### Gateway (`apps/gateway/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/agent-proxy.ts` | **Rewrite** | Replace raw ws + HTTP fetch with `GatewayClient`. Expose `sendToAgent()` using `client.request('chat.send', ...)` and forward `onEvent` callbacks. |
| `src/routes/chat.ts` | **Modify** | Forward new event types (`tool_call`, `tool_result`, `thinking`) from `sendToAgent` callbacks to widget WebSocket. |
| `src/services/token-usage.ts` | **Keep** | `TokenUsageAccumulator` already works with agent events — no changes needed. |
| `src/version.ts` | **Modify** | Bump `UI_VERSION` (minor — new message types). |
| `package.json` | **Modify** | Add `openclaw@2026.3.24` dependency. |

### Shared Types (`packages/shared-types/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/chat.ts` | **Modify** | Add `thinking` to `ServerMessage.type` union (tool_call/tool_result already exist). Add `toolCallId` field for correlating tool_call/tool_result pairs. |

### Chat Widget (`packages/chat-widget/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/services/gateway-types.ts` | **Modify** | Mirror `ServerMessage` changes from shared-types. |
| `src/lib/types.ts` | **Modify** | Add `toolCalls` and `thinking` fields to `DisplayMessage`. |
| `src/lib/stores/chat.ts` | **Modify** | Handle `tool_call`, `tool_result`, `thinking` message types. Fix `connected` handler to reset `loading`. |

---

## Chunk 1: Gateway Agent Proxy Fix

### Task 1: Add openclaw dependency to gateway

**Files:**
- Modify: `apps/gateway/package.json`

- [ ] **Step 1: Add openclaw as a dependency**

```json
"openclaw": "2026.3.24"
```

Add to the `dependencies` object in `apps/gateway/package.json`.

- [ ] **Step 2: Install**

Run: `pnpm install --filter=@quant-bot/gateway`
Expected: Clean install, lockfile updated.

- [ ] **Step 3: Verify import resolves**

Create a temp check:
Run: `cd apps/gateway && node -e "import('openclaw/plugin-sdk').then(m => console.log('GatewayClient' in m ? 'OK' : 'MISSING'))"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/package.json pnpm-lock.yaml
git commit -m "chore(gateway): add openclaw@2026.3.24 dependency for GatewayClient"
```

---

### Task 2: Rewrite agent-proxy.ts to use GatewayClient

**Files:**
- Rewrite: `apps/gateway/src/services/agent-proxy.ts`

This is the core fix. Replace the raw `ws` connection + HTTP `fetch` with OpenClaw's `GatewayClient`, which handles device identity, challenge-response auth, and scope preservation.

- [ ] **Step 1: Write the new agent-proxy.ts**

The new implementation must:
1. Use `GatewayClient` from `openclaw/plugin-sdk/gateway-runtime` for the agent connection
2. Let `GatewayClient` auto-create device identity (it calls `loadOrCreateDeviceIdentity` internally when `deviceIdentity` is omitted)
3. Connect with `scopes: ['operator.admin']` (auto-expands to include `operator.write`)
4. Send messages via `client.request('chat.send', { message, sessionKey, idempotencyKey })`
5. Listen for agent events via `onEvent` callback
6. Parse event streams: `assistant` (text deltas), `lifecycle` (phases), `model`, tool events
7. Map events to callbacks: `onDelta`, `onProgress`, `onToolCall`, `onToolResult`, `onError`
8. Use `TokenUsageAccumulator` for usage tracking (already exists)
9. Handle lifecycle `end` event as completion, lifecycle `error` as failure
10. Use 15s shortened idle timeout after lifecycle errors (fast-fail)

```typescript
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
```

- [ ] **Step 2: Verify gateway builds**

Run: `pnpm turbo build --filter=@quant-bot/gateway`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/gateway/src/services/agent-proxy.ts
git commit -m "feat(gateway): replace raw ws with GatewayClient for device-identity auth

Fixes chat.send scope failure caused by OpenClaw clearing operator
scopes for connections without device identity. GatewayClient auto-
generates Ed25519 device keys and handles challenge-response auth.

Also adds onToolCall, onToolResult, onError callbacks to sendToAgent
for rich event forwarding."
```

---

## Chunk 2: Message Types and Gateway Forwarding

### Task 3: Expand ServerMessage types

**Files:**
- Modify: `packages/shared-types/src/chat.ts`
- Modify: `packages/chat-widget/src/lib/services/gateway-types.ts`

- [ ] **Step 1: Update shared-types ServerMessage**

In `packages/shared-types/src/chat.ts`, replace the `ServerMessage` interface:

```typescript
export interface ServerMessage {
	type: 'message' | 'tool_call' | 'tool_result' | 'stream' | 'progress' | 'thinking' | 'error' | 'connected';
	sessionId: string;
	role?: 'assistant';
	content?: string;
	// tool_call fields
	name?: string;
	args?: Record<string, unknown>;
	toolCallId?: string;
	// tool_result fields
	result?: unknown;
	// stream fields
	delta?: string;
	// progress fields
	status?: string;
	// error fields
	code?: string;
	message?: string;
	// connected fields
	version?: string;
	minVersion?: string;
}
```

- [ ] **Step 2: Mirror changes in gateway-types.ts**

In `packages/chat-widget/src/lib/services/gateway-types.ts`, apply the same `ServerMessage` change. Add `thinking` to the type union, add `toolCallId` field.

- [ ] **Step 3: Build to verify types compile**

Run: `pnpm turbo build --filter=@quant-bot/shared-types --filter=@albionlabs/chat-widget`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/chat.ts packages/chat-widget/src/lib/services/gateway-types.ts
git commit -m "feat(types): add thinking, toolCallId to ServerMessage for rich events"
```

---

### Task 4: Forward rich events in chat route

**Files:**
- Modify: `apps/gateway/src/routes/chat.ts`
- Modify: `apps/gateway/src/version.ts`

- [ ] **Step 1: Update chat.ts to forward new event types**

In the `socket.on('message', ...)` handler, expand the `sendToAgent` call to include the new callbacks:

```typescript
// Track the last toolCallId so tool_result can reference it
let lastToolCallId: string | undefined;

const result = await sendToAgent({
	message: messageWithContext,
	userId: user!.sub,
	sessionId,
	timeoutMs: config.agentResponseTimeoutMs,
	onDelta: (delta) => {
		const streamMsg: ServerMessage = {
			type: 'stream',
			sessionId,
			delta
		};
		socket.send(JSON.stringify(streamMsg));
	},
	onProgress: (progress) => {
		const progressMsg: ServerMessage = {
			type: 'progress',
			sessionId,
			status: progress
		};
		socket.send(JSON.stringify(progressMsg));
	},
	onToolCall: (name, args) => {
		lastToolCallId = crypto.randomUUID();
		const toolCallMsg: ServerMessage = {
			type: 'tool_call',
			sessionId,
			name,
			args,
			toolCallId: lastToolCallId
		};
		socket.send(JSON.stringify(toolCallMsg));
	},
	onToolResult: (name, result) => {
		const toolResultMsg: ServerMessage = {
			type: 'tool_result',
			sessionId,
			name,
			result,
			toolCallId: lastToolCallId
		};
		socket.send(JSON.stringify(toolResultMsg));
		lastToolCallId = undefined;
	},
	onError: (error) => {
		const errorMsg: ServerMessage = {
			type: 'error',
			sessionId,
			code: 'AGENT_ERROR',
			message: error
		};
		socket.send(JSON.stringify(errorMsg));
	},
	onUsage: (usage) => {
		// ... existing usage logging (unchanged)
	}
});
```

- [ ] **Step 2: Bump UI_VERSION in version.ts**

Change `UI_VERSION` from `'0.14.16'` to `'0.15.0'` (minor bump — new message types).

- [ ] **Step 3: Build gateway**

Run: `pnpm turbo build --filter=@quant-bot/gateway`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/src/routes/chat.ts apps/gateway/src/version.ts
git commit -m "feat(gateway): forward tool_call, tool_result, error events to widget"
```

---

## Chunk 3: Widget State and Loading Fix

### Task 5: Fix widget connected handler and add new message types

**Files:**
- Modify: `packages/chat-widget/src/lib/types.ts`
- Modify: `packages/chat-widget/src/lib/stores/chat.ts`

- [ ] **Step 1: Expand DisplayMessage type**

In `packages/chat-widget/src/lib/types.ts`, add optional fields to `DisplayMessage`:

```typescript
export interface ToolCallInfo {
	toolCallId?: string;
	name: string;
	args?: Record<string, unknown>;
	result?: unknown;
	status: 'running' | 'completed' | 'error';
}

export interface DisplayMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	toolCalls?: ToolCallInfo[];
	thinking?: string;
}
```

- [ ] **Step 2: Fix connected handler to reset streamingAssistantMessageId**

In `packages/chat-widget/src/lib/stores/chat.ts`, the `connected` handler (around line 104) already resets `loading` and `thinkingStatus`. Add `streamingAssistantMessageId = null` before the `chat.update` call to prevent stale streaming state after reconnect:

```typescript
if (msg.type === 'connected') {
	reconnectAttempts = 0;
	streamingAssistantMessageId = null;
	chat.update((s) => ({
		...s,
		connected: true,
		reconnecting: false,
		loading: false,
		thinkingStatus: null,
		backendVersion: msg.version ?? null
	}));
	return;
}
```

- [ ] **Step 3: Handle tool_call messages**

Add a new handler block in the `ws.onmessage` handler, after the `stream` handler:

```typescript
} else if (msg.type === 'tool_call' && msg.name) {
	chat.update((s) => {
		const messages = [...s.messages];
		const now = Date.now();

		// Find or create the current assistant message to attach tool calls to
		let idx = streamingAssistantMessageId
			? messages.findIndex((m) => m.id === streamingAssistantMessageId)
			: -1;

		if (idx < 0) {
			streamingAssistantMessageId = `msg-${++messageCounter}`;
			messages.push({
				id: streamingAssistantMessageId,
				role: 'assistant',
				content: '',
				timestamp: now,
				toolCalls: []
			});
			idx = messages.length - 1;
		}

		const existing = messages[idx];
		const toolCalls = [...(existing.toolCalls ?? [])];
		toolCalls.push({
			toolCallId: msg.toolCallId,
			name: msg.name!,
			args: msg.args,
			status: 'running'
		});
		messages[idx] = { ...existing, toolCalls, timestamp: now };

		return {
			...s,
			messages,
			thinkingStatus: `Running ${msg.name}\u2026`,
			sessionId: msg.sessionId ?? s.sessionId,
			loading: true
		};
	});
} else if (msg.type === 'tool_result' && msg.name) {
	chat.update((s) => {
		const messages = [...s.messages];
		if (!streamingAssistantMessageId) return s;

		const idx = messages.findIndex((m) => m.id === streamingAssistantMessageId);
		if (idx < 0) return s;

		const existing = messages[idx];
		// Match by toolCallId when available, fall back to matching first running tool by name
		const toolCalls = (existing.toolCalls ?? []).map((tc) => {
			if (msg.toolCallId && tc.toolCallId === msg.toolCallId) {
				return { ...tc, result: msg.result, status: 'completed' as const };
			}
			if (!msg.toolCallId && tc.name === msg.name && tc.status === 'running') {
				return { ...tc, result: msg.result, status: 'completed' as const };
			}
			return tc;
		});
		messages[idx] = { ...existing, toolCalls, timestamp: Date.now() };

		return {
			...s,
			messages,
			sessionId: msg.sessionId ?? s.sessionId
		};
	});
```

- [ ] **Step 4: Update error handler to reset loading on AGENT_ERROR during streaming**

The existing error handler already sets `loading: false`. Verify the `AGENT_ERROR` code from `onError` callback is handled correctly — it is, since it matches the existing error handler path.

- [ ] **Step 5: Build widget**

Run: `pnpm turbo build --filter=@albionlabs/chat-widget`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/chat-widget/src/lib/types.ts packages/chat-widget/src/lib/stores/chat.ts
git commit -m "feat(chat-widget): handle tool_call/tool_result events in chat store

Adds tool_call and tool_result message handlers to display tool
activity. Resets streamingAssistantMessageId on reconnect to
prevent stale streaming state."
```

---

## Chunk 4: Clean Up and Integration Test

### Task 6: Remove stale uncommitted changes and verify end-to-end

**Files:**
- Clean: `apps/agent/openclaw.json` (revert `trustedProxies` addition — no longer needed)

- [ ] **Step 1: Revert openclaw.json uncommitted changes**

The `trustedProxies: []` addition was a workaround for the scope issue. It's no longer needed since `GatewayClient` handles auth properly.

Run: `git checkout -- apps/agent/openclaw.json`

- [ ] **Step 2: Delete the .bak file**

Run: `rm apps/agent/openclaw.json.bak`

- [ ] **Step 3: Full build**

Run: `pnpm turbo build`
Expected: All packages build successfully.

- [ ] **Step 4: Run tests**

Run: `pnpm turbo test:run`
Expected: All tests pass.

- [ ] **Step 5: Manual integration test checklist**

Verify with `docker compose up`:
1. Gateway connects to agent — look for `[agent-proxy] connected to openclaw agent (GatewayClient)` log
2. Send a message from the widget — should see `chat.send` succeed (no scope errors)
3. Text streams to widget in real-time (stream messages)
4. Tool calls appear in the widget (tool_call messages)
5. Agent errors surface in the widget (not stuck on loading)
6. Disconnecting and reconnecting resets the loading state

- [ ] **Step 6: Commit cleanup**

```bash
git add apps/agent/openclaw.json
git rm apps/agent/openclaw.json.bak 2>/dev/null || true
git commit -m "chore: remove stale openclaw.json workarounds and backup file"
```

---

## Summary of Changes

| Change | Why |
|--------|-----|
| `GatewayClient` replaces raw ws + HTTP | Fixes scope auth; device identity preserves `operator.admin` |
| New `onToolCall`/`onToolResult`/`onError` callbacks | Rich event forwarding from agent to widget |
| `ServerMessage` type expanded | `tool_call`, `tool_result`, `thinking` message types |
| `DisplayMessage` expanded | `toolCalls` array for rendering tool activity |
| `connected` handler resets `loading` | Fixes stuck loading indicator after reconnect |
| `openclaw@2026.3.24` added as gateway dependency | Provides `GatewayClient` and `loadOrCreateDeviceIdentity` |
