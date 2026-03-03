<script lang="ts">
	import type { DisplayMessage } from '../types.js';

	let { message }: { message: DisplayMessage } = $props();

	type RainlangReviewPayload = {
		title: string;
		rainlang: string;
		contentWithoutReview: string;
	};

	const DEFAULT_REVIEW_TITLE = 'Rainlang Strategy Review';
	const taggedReviewRegex = /<rainlang-review(?:\s+title="([^"]*)")?>([\s\S]*?)<\/rainlang-review>/i;
	const fencedReviewRegex = /```rainlang\s*([\s\S]*?)```/i;

	function parseRainlangReview(content: string): RainlangReviewPayload | null {
		const taggedMatch = content.match(taggedReviewRegex);
		if (taggedMatch) {
			const [fullMatch, title, rainlang] = taggedMatch;
			return {
				title: title?.trim() || DEFAULT_REVIEW_TITLE,
				rainlang: (rainlang ?? '').trim(),
				contentWithoutReview: content.replace(fullMatch, '').trim()
			};
		}

		const fencedMatch = content.match(fencedReviewRegex);
		if (fencedMatch) {
			const [fullMatch, rainlang] = fencedMatch;
			return {
				title: DEFAULT_REVIEW_TITLE,
				rainlang: (rainlang ?? '').trim(),
				contentWithoutReview: content.replace(fullMatch, '').trim()
			};
		}

		return null;
	}

	let isReviewModalOpen = $state(false);

	const isUser = $derived(message.role === 'user');
	const isSystem = $derived(message.role === 'system');
	const rainlangReview = $derived(parseRainlangReview(message.content));
	const displayContent = $derived(rainlangReview?.contentWithoutReview ?? message.content);
	const timeStr = $derived(new Date(message.timestamp).toLocaleTimeString());
</script>

<div class="chat-bubble" class:user={isUser} class:assistant={!isUser && !isSystem} class:system={isSystem}>
	<div class="bubble-content">
		{#if displayContent}
			<div class="message-text">{displayContent}</div>
		{/if}
		{#if rainlangReview}
			<button class="review-btn" onclick={() => (isReviewModalOpen = true)}>Review Rainlang Strategy</button>
		{/if}
	</div>
	<div class="bubble-time">{timeStr}</div>
</div>

{#if isReviewModalOpen && rainlangReview}
	<div
		class="review-modal-backdrop"
		role="button"
		tabindex="0"
		aria-label="Close Rainlang strategy review modal"
		onclick={(event) => {
			if (event.target === event.currentTarget) {
				isReviewModalOpen = false;
			}
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') {
				isReviewModalOpen = false;
			}
		}}
	>
		<div class="review-modal" role="dialog" aria-modal="true" aria-labelledby={`rainlang-review-title-${message.id}`}>
			<div class="review-modal-header">
				<h3 id={`rainlang-review-title-${message.id}`}>{rainlangReview.title}</h3>
				<button class="close-btn" aria-label="Close Rainlang review modal" onclick={() => (isReviewModalOpen = false)}>
					Close
				</button>
			</div>
			<pre class="rainlang-code"><code>{rainlangReview.rainlang}</code></pre>
		</div>
	</div>
{/if}

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

	.bubble-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.message-text {
		white-space: pre-wrap;
	}

	.review-btn {
		align-self: flex-start;
		padding: 0.35rem 0.6rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(31, 41, 55, 0.2);
		background: rgba(255, 255, 255, 0.75);
		color: #111827;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.user .review-btn {
		background: rgba(255, 255, 255, 0.2);
		color: #ffffff;
		border-color: rgba(255, 255, 255, 0.35);
	}

	.review-btn:hover {
		filter: brightness(0.95);
	}

	.review-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(17, 24, 39, 0.45);
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1rem;
		z-index: 1000;
	}

	.review-modal {
		width: min(900px, 95vw);
		max-height: min(80vh, 760px);
		background: #ffffff;
		border-radius: 0.75rem;
		border: 1px solid #d1d5db;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.review-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.review-modal-header h3 {
		margin: 0;
		font-size: 0.95rem;
		color: #111827;
	}

	.close-btn {
		border: 1px solid #d1d5db;
		background: #f9fafb;
		color: #111827;
		border-radius: 0.4rem;
		padding: 0.35rem 0.55rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.rainlang-code {
		margin: 0;
		padding: 1rem;
		overflow: auto;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
		font-size: 0.8rem;
		line-height: 1.45;
		background: #f8fafc;
		color: #0f172a;
	}
</style>
