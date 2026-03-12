<script lang="ts">
	import { chat, sendMessage } from '../stores/chat.js';

	let input = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || !$chat.connected) return;
		sendMessage(trimmed);
		input = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	}
</script>

<form class="message-input" onsubmit={handleSubmit}>
	<textarea
		bind:value={input}
		onkeydown={handleKeydown}
		placeholder={$chat.connected ? 'Type a message...' : 'Reconnecting...'}
		disabled={!$chat.connected}
		rows={1}
	></textarea>
	<button type="submit" disabled={!$chat.connected || !input.trim()}>
		Send
	</button>
</form>

<style>
	.message-input {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--cw-border);
		background: var(--cw-bg);
	}

	textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--cw-input-border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.5;
		outline: none;
		background: var(--cw-input-bg);
		color: var(--cw-text);
	}

	textarea:focus {
		border-color: var(--cw-accent);
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	textarea:disabled {
		background: var(--cw-input-disabled-bg);
		cursor: not-allowed;
	}

	button {
		padding: 0.5rem 1rem;
		background: var(--cw-accent);
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
		white-space: nowrap;
	}

	button:hover:not(:disabled) {
		background: var(--cw-accent-hover);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
