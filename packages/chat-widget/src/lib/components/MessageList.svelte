<script lang="ts">
	import { chat } from '../stores/chat.js';
	import ChatBubble from './ChatBubble.svelte';

	let container: HTMLDivElement | undefined = $state();

	$effect(() => {
		if ($chat.messages.length && container) {
			container.scrollTop = container.scrollHeight;
		}
	});
</script>

<div class="message-list" bind:this={container}>
	{#each $chat.messages as message (message.id)}
		<ChatBubble {message} />
	{/each}
	{#if $chat.loading}
		<div class="typing-indicator">
			<span></span><span></span><span></span>
		</div>
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.typing-indicator {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 1rem;
		background: var(--cw-typing-bg);
		border-radius: 1rem;
	}

	.typing-indicator span {
		width: 0.5rem;
		height: 0.5rem;
		background: var(--cw-typing-dot);
		border-radius: 50%;
		animation: bounce 1.4s infinite ease-in-out both;
	}

	.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
	.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

	@keyframes bounce {
		0%, 80%, 100% { transform: scale(0); }
		40% { transform: scale(1); }
	}
</style>
