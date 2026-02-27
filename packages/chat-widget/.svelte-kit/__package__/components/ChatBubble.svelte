<script lang="ts">
	import type { DisplayMessage } from '../types.js';

	let { message }: { message: DisplayMessage } = $props();

	const isUser = $derived(message.role === 'user');
	const isSystem = $derived(message.role === 'system');
	const timeStr = $derived(new Date(message.timestamp).toLocaleTimeString());
</script>

<div class="chat-bubble" class:user={isUser} class:assistant={!isUser && !isSystem} class:system={isSystem}>
	<div class="bubble-content">
		{message.content}
	</div>
	<div class="bubble-time">{timeStr}</div>
</div>

<style>
	.chat-bubble {
		max-width: 80%;
		padding: 0.75rem 1rem;
		border-radius: 1rem;
		margin-bottom: 0.5rem;
		word-wrap: break-word;
	}

	.user {
		align-self: flex-end;
		background: #3b82f6;
		color: white;
		border-bottom-right-radius: 0.25rem;
	}

	.assistant {
		align-self: flex-start;
		background: #f3f4f6;
		color: #1f2937;
		border-bottom-left-radius: 0.25rem;
	}

	.system {
		align-self: center;
		background: #fef3c7;
		color: #92400e;
		font-size: 0.875rem;
		border-radius: 0.5rem;
	}

	.bubble-time {
		font-size: 0.7rem;
		opacity: 0.6;
		margin-top: 0.25rem;
	}
</style>
