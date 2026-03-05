<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { connect, disconnect, chat } from './stores/chat.js';
	import MessageList from './components/MessageList.svelte';
	import MessageInput from './components/MessageInput.svelte';
	import type { ChatWidgetConfig } from './types.js';

	let { config }: { config: ChatWidgetConfig } = $props();

	onMount(() => {
		if (config.token) {
			connect(config.gatewayUrl, config.token);
		}
	});

	onDestroy(() => {
		disconnect();
	});
</script>

<div class="chat-widget">
	<div class="chat-header">
		<span class="chat-title">quant.bot</span>
		<span class="status-dot" class:connected={$chat.connected}></span>
		{#if $chat.connected && $chat.backendVersion}
			<span class="version-label">v {$chat.backendVersion}</span>
		{/if}
	</div>
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
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
		overflow: hidden;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: white;
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: #1f2937;
		color: white;
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

	.version-label {
		margin-left: auto;
		font-size: 0.65rem;
		font-family: monospace;
		color: #9ca3af;
	}
</style>
