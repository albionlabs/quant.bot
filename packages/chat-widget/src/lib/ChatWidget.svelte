<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { connect, disconnect, reconnect, chat } from './stores/chat.js';
	import AlbionMark from './components/AlbionMark.svelte';
	import MessageList from './components/MessageList.svelte';
	import MessageInput from './components/MessageInput.svelte';
	import { getThemeStyle } from './theme.js';
	import type { ChatWidgetConfig } from './types.js';

	let { config, hideHeader = false, manageLifecycle = true }: { config: ChatWidgetConfig; hideHeader?: boolean; manageLifecycle?: boolean } = $props();

	const name = $derived(config.name ?? 'quant.bot');
	const theme = $derived(config.theme ?? 'dark');
	const themeStyle = $derived(getThemeStyle(theme));

	onMount(() => {
		if (manageLifecycle && config.token) {
			connect(config.gatewayUrl, config.token);
		}
	});

	onDestroy(() => {
		if (manageLifecycle) {
			disconnect();
		}
	});
</script>

<div class="chat-widget" style={themeStyle}>
	{#if !hideHeader}
	<div class="chat-header">
		<div class="chat-brand">
			<AlbionMark size={18} variant="light" />
			<span class="chat-title">{name}</span>
		</div>
		{#if $chat.reconnecting}
			<span class="status-dot reconnecting"></span>
			<span class="reconnecting-label">Reconnecting...</span>
		{:else}
			<span class="status-dot" class:connected={$chat.connected}></span>
			{#if !$chat.connected}
				<button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
			{/if}
		{/if}
		{#if $chat.connected && $chat.backendVersion}
			<span class="version-label">v {$chat.backendVersion}</span>
		{/if}
	</div>
	{/if}
	<MessageList />
	<MessageInput />
</div>

<style>
	.chat-widget {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 400px;
		border: 1px solid var(--cw-border);
		border-radius: 0.75rem;
		overflow: hidden;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: var(--cw-bg);
		color: var(--cw-text);
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: var(--cw-header-bg);
		color: white;
	}

	.chat-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-title {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.status-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #ef4444;
	}

	.status-dot.connected {
		background: #22c55e;
	}

	.status-dot.reconnecting {
		background: #f59e0b;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.reconnecting-label {
		font-size: 0.7rem;
		color: #f59e0b;
	}

	.reconnect-btn {
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		border: 1px solid #6b7280;
		border-radius: 0.25rem;
		background: transparent;
		color: white;
		cursor: pointer;
	}

	.reconnect-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: #9ca3af;
	}

	.version-label {
		margin-left: auto;
		font-size: 0.65rem;
		font-family: monospace;
		color: #9ca3af;
	}
</style>
