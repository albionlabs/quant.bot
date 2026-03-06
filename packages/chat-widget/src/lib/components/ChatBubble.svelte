<script lang="ts">
	import type { DisplayMessage } from '../types.js';
	import type { TxSignRequestPayload } from '../types.js';
	import { signTransactionRequest } from '../stores/wallet.js';

	let { message }: { message: DisplayMessage } = $props();

	type RainlangReviewPayload = {
		title: string;
		rainlang: string;
		contentWithoutReview: string;
	};

	const DEFAULT_REVIEW_TITLE = 'Rainlang Strategy Review';
	const taggedReviewRegex = /<rainlang-review(?:\s+title="([^"]*)")?>([\s\S]*?)<\/rainlang-review>/i;
	const fencedReviewRegex = /```rainlang\s*([\s\S]*?)```/i;
	const txSignRequestRegex = /<tx-sign-request>([\s\S]*?)<\/tx-sign-request>/i;

	type TxSignRequestView = {
		request: TxSignRequestPayload;
		contentWithoutRequest: string;
	};

	function isTxSignRequestPayload(value: unknown): value is TxSignRequestPayload {
		if (!value || typeof value !== 'object') return false;
		const candidate = value as Record<string, unknown>;
		return (
			candidate.kind === 'evm_send_transaction'
			&& typeof candidate.chainId === 'number'
			&& typeof candidate.from === 'string'
			&& typeof candidate.to === 'string'
			&& typeof candidate.data === 'string'
			&& typeof candidate.value === 'string'
		);
	}

	function parseTxSignRequest(content: string): TxSignRequestView | null {
		const match = content.match(txSignRequestRegex);
		if (!match) return null;

		const [fullMatch, jsonPayload] = match;
		try {
			const parsed = JSON.parse((jsonPayload ?? '').trim()) as unknown;
			if (!isTxSignRequestPayload(parsed)) return null;
			return {
				request: parsed,
				contentWithoutRequest: content.replace(fullMatch, '').trim()
			};
		} catch {
			return null;
		}
	}

	function shortenHex(value: string, head = 12, tail = 10): string {
		if (!value.startsWith('0x')) return value;
		if (value.length <= head + tail + 3) return value;
		return `${value.slice(0, head)}...${value.slice(-tail)}`;
	}

	function basescanTxUrl(chainId: number, txHash: string): string {
		const hash = txHash.trim();
		if (chainId === 84532) {
			return `https://sepolia.basescan.org/tx/${hash}`;
		}
		return `https://basescan.org/tx/${hash}`;
	}

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
	let isSigningTx = $state(false);
	let signedTxHash = $state<string | null>(null);
	let signingError = $state<string | null>(null);

	const isUser = $derived(message.role === 'user');
	const isSystem = $derived(message.role === 'system');
	const txSignRequest = $derived(parseTxSignRequest(message.content));
	const contentWithoutTxRequest = $derived(txSignRequest?.contentWithoutRequest ?? message.content);
	const rainlangReview = $derived(parseRainlangReview(contentWithoutTxRequest));
	const displayContent = $derived(rainlangReview?.contentWithoutReview ?? contentWithoutTxRequest);
	const timeStr = $derived(new Date(message.timestamp).toLocaleTimeString());

	async function handleSignTxRequest() {
		if (!txSignRequest || isSigningTx || signedTxHash) return;

		isSigningTx = true;
		signingError = null;
		try {
			const hash = await signTransactionRequest(txSignRequest.request);
			signedTxHash = hash;
		} catch (error) {
			signingError = error instanceof Error ? error.message : 'Failed to sign transaction';
		} finally {
			isSigningTx = false;
		}
	}
</script>

<div class="chat-bubble" class:user={isUser} class:assistant={!isUser && !isSystem} class:system={isSystem}>
	<div class="bubble-content">
		{#if displayContent}
			<div class="message-text">{displayContent}</div>
		{/if}
		{#if rainlangReview}
			<button class="review-btn" onclick={() => (isReviewModalOpen = true)}>Review Rainlang Strategy</button>
		{/if}
		{#if txSignRequest && !isUser && !isSystem}
			<button class="sign-btn" onclick={handleSignTxRequest} disabled={isSigningTx || !!signedTxHash}>
				{#if signedTxHash}
					Transaction Submitted
				{:else if isSigningTx}
					Waiting for Signature...
				{:else}
					Sign Transaction
				{/if}
			</button>
			{#if signedTxHash}
				<div class="sign-status success">
					Tx Hash: <code>{signedTxHash}</code>
					<a
						class="tx-link"
						href={basescanTxUrl(txSignRequest.request.chainId, signedTxHash)}
						target="_blank"
						rel="noopener noreferrer"
					>
						View on BaseScan
					</a>
				</div>
			{/if}
			{#if signingError}
				<div class="sign-status error">{signingError}</div>
			{/if}
			<details class="tx-details">
				<summary>Transaction Details</summary>
				<div class="tx-row"><span>From</span><code>{txSignRequest.request.from}</code></div>
				<div class="tx-row"><span>To</span><code>{txSignRequest.request.to}</code></div>
				<div class="tx-row"><span>Value (wei)</span><code>{txSignRequest.request.value}</code></div>
				<div class="tx-row"><span>Chain</span><code>{txSignRequest.request.chainId}</code></div>
				<div class="tx-row"><span>Calldata</span><code>{shortenHex(txSignRequest.request.data, 14, 12)}</code></div>
			</details>
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

	.sign-btn {
		align-self: flex-start;
		padding: 0.45rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid #2563eb;
		background: #2563eb;
		color: #ffffff;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.sign-btn:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.sign-status {
		font-size: 0.76rem;
		padding: 0.35rem 0.5rem;
		border-radius: 0.4rem;
	}

	.sign-status.success {
		background: #ecfdf3;
		color: #166534;
	}

	.tx-link {
		margin-left: 0.5rem;
		font-weight: 600;
		color: #065f46;
		text-decoration: underline;
	}

	.sign-status.error {
		background: #fef2f2;
		color: #991b1b;
	}

	.tx-details {
		font-size: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
		background: #f8fafc;
	}

	.tx-details summary {
		cursor: pointer;
		font-weight: 600;
		color: #334155;
	}

	.tx-row {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.3rem;
		align-items: baseline;
	}

	.tx-row span {
		color: #475569;
		min-width: 4.5rem;
	}

	.tx-row code {
		word-break: break-all;
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
