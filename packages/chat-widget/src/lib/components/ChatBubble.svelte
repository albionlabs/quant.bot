<script lang="ts">
	import type { DisplayMessage, TxSignRequestPayload } from '../types.js';
	import type { SigningBundle, SigningCompleteResponse } from '../services/gateway-types.js';
	import { sendMessage } from '../stores/chat.js';
	import { signTransactionRequest, waitForTransactionConfirmation } from '../stores/wallet.js';
	import { fetchSigningBundle, completeSigningBundle } from '../services/gateway-api.js';

	let { message }: { message: DisplayMessage } = $props();

	type RainlangReviewPayload = {
		title: string;
		rainlang: string;
		contentWithoutReview: string;
	};

	const DEFAULT_REVIEW_TITLE = 'Rainlang Strategy Review';
	const taggedReviewRegex = /<rainlang-review(?:\s+title="([^"]*)")?>([\s\S]*?)<\/rainlang-review>/i;
	const fencedReviewRegex = /```rainlang\s*([\s\S]*?)```/i;
	const txSignRequestRegex = /<(tx-sign-request|signature_request)>([\s\S]*?)<\/\1>/gi;
	const txSignRefRegex = /<tx-sign\s+id="([^"]+)">([\s\S]*?)<\/tx-sign>/gi;

	type TxSignRequestView = {
		requests: Array<{
			id: string;
			request: TxSignRequestPayload;
		}>;
		contentWithoutRequests: string;
	};

	type TxSignRefView = {
		refs: Array<{ signingId: string; summary: string }>;
		contentWithoutRefs: string;
	};

	type BundleSignState = {
		status: 'idle' | 'loading' | 'ready' | 'signing' | 'completed' | 'error';
		bundle?: SigningBundle;
		currentTxIndex: number;
		txHashes: string[];
		error?: string;
		completionResult?: SigningCompleteResponse;
	};

	type TxSignState = {
		isSigning: boolean;
		signedTxHash: string | null;
		signingError: string | null;
		waitingForConfirmation: boolean;
		confirmationError: string | null;
		autoProceedSent: boolean;
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

	function parseTxSignRequests(content: string): TxSignRequestView {
		const requests: TxSignRequestView['requests'] = [];
		let contentWithoutRequests = content;
		txSignRequestRegex.lastIndex = 0;
		let match: RegExpExecArray | null = txSignRequestRegex.exec(content);
		let requestIndex = 0;

		while (match) {
			const [fullMatch, _tagName, jsonPayload] = match;
			try {
				const parsed = JSON.parse((jsonPayload ?? '').trim()) as unknown;
				if (isTxSignRequestPayload(parsed)) {
					requests.push({
						id: `${message.id}:${requestIndex}`,
						request: parsed
					});
					contentWithoutRequests = contentWithoutRequests.replace(fullMatch, '');
				}
			} catch {
				// Keep malformed tags in message text for visibility.
			}
			requestIndex += 1;
			match = txSignRequestRegex.exec(content);
		}

		return {
			requests,
			contentWithoutRequests: contentWithoutRequests.trim()
		};
	}

	function parseTxSignRefs(content: string): TxSignRefView {
		const refs: TxSignRefView['refs'] = [];
		let contentWithoutRefs = content;
		txSignRefRegex.lastIndex = 0;
		let match: RegExpExecArray | null = txSignRefRegex.exec(content);

		while (match) {
			const [fullMatch, signingId, summary] = match;
			if (signingId) {
				refs.push({ signingId, summary: (summary ?? '').trim() });
				contentWithoutRefs = contentWithoutRefs.replace(fullMatch, '');
			}
			match = txSignRefRegex.exec(content);
		}

		return { refs, contentWithoutRefs: contentWithoutRefs.trim() };
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

	const DEFAULT_CHAIN_ID = 8453;

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function renderContentWithHashLinks(content: string): string {
		const escaped = escapeHtml(content);
		return escaped.replace(
			/\b(0x[a-fA-F0-9]{64})\b/g,
			(hash) =>
				`<a class="inline-hash" href="${basescanTxUrl(DEFAULT_CHAIN_ID, hash)}" target="_blank" rel="noopener noreferrer">${shortenHex(hash, 10, 8)}</a>`
		);
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
	let txSignStates = $state<Record<string, TxSignState>>({});
	let bundleStates = $state<Record<string, BundleSignState>>({});

	function getBundleState(signingId: string): BundleSignState {
		return bundleStates[signingId] ?? {
			status: 'idle',
			currentTxIndex: 0,
			txHashes: []
		};
	}

	function patchBundleState(signingId: string, patch: Partial<BundleSignState>): void {
		bundleStates = {
			...bundleStates,
			[signingId]: { ...getBundleState(signingId), ...patch }
		};
	}

	async function handleSignBundle(signingId: string) {
		const current = getBundleState(signingId);
		if (current.status === 'loading' || current.status === 'signing' || current.status === 'completed') return;

		patchBundleState(signingId, { status: 'loading', error: undefined });

		let bundle: SigningBundle;
		try {
			bundle = await fetchSigningBundle(signingId);
		} catch (error) {
			patchBundleState(signingId, {
				status: 'error',
				error: error instanceof Error ? error.message : 'Failed to load signing bundle'
			});
			return;
		}

		patchBundleState(signingId, { status: 'ready', bundle });

		// If there's composedRainlang in metadata, show review modal
		if (bundle.metadata?.composedRainlang) {
			isReviewModalOpen = true;
		}
	}

	async function executeBundleSigning(signingId: string) {
		const state = getBundleState(signingId);
		if (!state.bundle || state.status === 'signing' || state.status === 'completed') return;

		const bundle = state.bundle;
		patchBundleState(signingId, { status: 'signing', currentTxIndex: 0, txHashes: [] });

		const collectedHashes: string[] = [];
		for (let i = 0; i < bundle.transactions.length; i++) {
			patchBundleState(signingId, { currentTxIndex: i });

			const tx = bundle.transactions[i];
			const payload: TxSignRequestPayload = {
				kind: 'evm_send_transaction',
				chainId: bundle.chainId,
				from: bundle.from,
				to: tx.to,
				data: tx.data,
				value: tx.value ?? '0'
			};

			let hash: string;
			try {
				hash = await signTransactionRequest(payload);
			} catch (error) {
				patchBundleState(signingId, {
					status: 'error',
					error: `Failed signing tx ${i + 1} (${tx.label}): ${error instanceof Error ? error.message : 'Unknown error'}`,
					txHashes: collectedHashes
				});
				return;
			}

			collectedHashes.push(hash);
			patchBundleState(signingId, { txHashes: [...collectedHashes] });

			// Wait for confirmation before proceeding to next tx
			try {
				const confirmed = await waitForTransactionConfirmation(hash);
				if (!confirmed) {
					patchBundleState(signingId, {
						status: 'error',
						error: `Tx ${i + 1} (${tx.label}) timed out waiting for confirmation`,
						txHashes: collectedHashes
					});
					return;
				}
			} catch (error) {
				patchBundleState(signingId, {
					status: 'error',
					error: `Tx ${i + 1} confirmation error: ${error instanceof Error ? error.message : 'Unknown'}`,
					txHashes: collectedHashes
				});
				return;
			}
		}

		// All signed and confirmed — call completion endpoint
		try {
			const result = await completeSigningBundle(signingId, collectedHashes);
			patchBundleState(signingId, {
				status: 'completed',
				txHashes: collectedHashes,
				completionResult: result
			});
		} catch (error) {
			// Transactions are on-chain, just completion lookup failed
			patchBundleState(signingId, {
				status: 'completed',
				txHashes: collectedHashes,
				error: `Completion lookup failed: ${error instanceof Error ? error.message : 'Unknown'}`
			});
		}
	}

	function createInitialTxSignState(): TxSignState {
		return {
			isSigning: false,
			signedTxHash: null,
			signingError: null,
			waitingForConfirmation: false,
			confirmationError: null,
			autoProceedSent: false
		};
	}

	function getTxSignState(requestId: string): TxSignState {
		return txSignStates[requestId] ?? createInitialTxSignState();
	}

	function patchTxSignState(requestId: string, patch: Partial<TxSignState>): void {
		txSignStates = {
			...txSignStates,
			[requestId]: {
				...getTxSignState(requestId),
				...patch
			}
		};
	}

	const isUser = $derived(message.role === 'user');
	const isSystem = $derived(message.role === 'system');
	const txSignRequestView = $derived(parseTxSignRequests(message.content));
	const txSignRequests = $derived(txSignRequestView.requests);
	const txSignRefView = $derived(parseTxSignRefs(txSignRequestView.contentWithoutRequests));
	const txSignRefs = $derived(txSignRefView.refs);
	const contentWithoutTxRequest = $derived(txSignRefView.contentWithoutRefs);
	const rainlangReview = $derived(parseRainlangReview(contentWithoutTxRequest));
	const bundleRainlangReview = $derived.by(() => {
		for (const ref of txSignRefs) {
			const state = getBundleState(ref.signingId);
			if (state.bundle?.metadata?.composedRainlang) {
				return {
					title: DEFAULT_REVIEW_TITLE,
					rainlang: state.bundle.metadata.composedRainlang,
					contentWithoutReview: ''
				};
			}
		}
		return null;
	});
	const displayContent = $derived(rainlangReview?.contentWithoutReview ?? contentWithoutTxRequest);
	const renderedContent = $derived(renderContentWithHashLinks(displayContent));
	const activeReview = $derived(rainlangReview ?? bundleRainlangReview);
	const timeStr = $derived(new Date(message.timestamp).toLocaleTimeString());

	async function handleSignTxRequest(requestId: string, requestPayload: TxSignRequestPayload, position: number) {
		const currentState = getTxSignState(requestId);
		if (currentState.isSigning || currentState.signedTxHash) return;

		patchTxSignState(requestId, {
			isSigning: true,
			signingError: null,
			confirmationError: null
		});
		try {
			const hash = await signTransactionRequest(requestPayload);
			patchTxSignState(requestId, {
				signedTxHash: hash,
				waitingForConfirmation: true
			});

			const isConfirmed = await waitForTransactionConfirmation(hash);
			if (!isConfirmed) {
				patchTxSignState(requestId, {
					waitingForConfirmation: false,
					confirmationError: 'Timed out waiting for confirmation. You can still continue manually.'
				});
				return;
			}

			patchTxSignState(requestId, {
				waitingForConfirmation: false
			});

			if (!getTxSignState(requestId).autoProceedSent) {
				patchTxSignState(requestId, { autoProceedSent: true });
				const transactionLabel = txSignRequests.length > 1 ? `Transaction ${position + 1}` : 'Transaction';
				sendMessage(`${transactionLabel} confirmed on-chain: ${hash}. Continue.`);
			}
		} catch (error) {
			patchTxSignState(requestId, {
				signingError: error instanceof Error ? error.message : 'Failed to sign transaction',
				waitingForConfirmation: false
			});
		} finally {
			patchTxSignState(requestId, { isSigning: false });
		}
	}
</script>

{#snippet txHashBox(hash: string, index: number, chainId: number)}
	<div class="hash-link-box">
		<span class="hash-label">Tx {index + 1}</span>
		<code>{shortenHex(hash, 10, 8)}</code>
		<a class="hash-explorer-link" href={basescanTxUrl(chainId, hash)} target="_blank" rel="noopener noreferrer">BaseScan ↗</a>
	</div>
{/snippet}

{#snippet orderHashBox(hash: string, url: string)}
	<div class="hash-link-box order">
		<span class="hash-label">Order</span>
		<code>{shortenHex(hash, 10, 8)}</code>
		<a class="hash-explorer-link" href={url} target="_blank" rel="noopener noreferrer">Raindex ↗</a>
	</div>
{/snippet}

<div class="chat-bubble" class:user={isUser} class:assistant={!isUser && !isSystem} class:system={isSystem}>
	<div class="bubble-content">
		{#if displayContent}
			<div class="message-text">{@html renderedContent}</div>
		{/if}
		{#if rainlangReview}
			<button class="review-btn" onclick={() => (isReviewModalOpen = true)}>Review Rainlang Strategy</button>
		{/if}
		{#if txSignRequests.length > 0 && !isUser && !isSystem}
			{#each txSignRequests as txRequest, index (txRequest.id)}
				{@const txState = getTxSignState(txRequest.id)}
				<div class="tx-request-card">
					<button
						class="sign-btn"
						onclick={() => handleSignTxRequest(txRequest.id, txRequest.request, index)}
						disabled={txState.isSigning || !!txState.signedTxHash}
					>
						{#if txState.signedTxHash}
							Transaction Submitted
						{:else if txState.isSigning}
							Waiting for Signature...
						{:else if txSignRequests.length > 1}
							Sign Transaction {index + 1}
						{:else}
							Sign Transaction
						{/if}
					</button>
					{#if txState.signedTxHash}
						<div class="sign-status success">
							Tx Hash: <code>{txState.signedTxHash}</code>
							<a
								class="tx-link"
								href={basescanTxUrl(txRequest.request.chainId, txState.signedTxHash)}
								target="_blank"
								rel="noopener noreferrer"
							>
								View on BaseScan
							</a>
						</div>
					{/if}
					{#if txState.waitingForConfirmation}
						<div class="sign-status pending">Waiting for on-chain confirmation...</div>
					{/if}
					{#if txState.autoProceedSent}
						<div class="sign-status success">Confirmed on-chain. Bot notified to proceed.</div>
					{/if}
					{#if txState.confirmationError}
						<div class="sign-status error">{txState.confirmationError}</div>
					{/if}
					{#if txState.signingError}
						<div class="sign-status error">{txState.signingError}</div>
					{/if}
					<details class="tx-details">
						<summary>Transaction Details{txSignRequests.length > 1 ? ` (${index + 1})` : ''}</summary>
						<div class="tx-row"><span>From</span><code>{txRequest.request.from}</code></div>
						<div class="tx-row"><span>To</span><code>{txRequest.request.to}</code></div>
						<div class="tx-row"><span>Value (wei)</span><code>{txRequest.request.value}</code></div>
						<div class="tx-row"><span>Chain</span><code>{txRequest.request.chainId}</code></div>
						<div class="tx-row"><span>Calldata</span><code>{shortenHex(txRequest.request.data, 14, 12)}</code></div>
					</details>
				</div>
			{/each}
		{/if}
		{#if txSignRefs.length > 0 && !isUser && !isSystem}
			{#each txSignRefs as ref (ref.signingId)}
				{@const bState = getBundleState(ref.signingId)}
				<div class="tx-request-card">
					<div class="bundle-summary">{ref.summary}</div>
					{#if bState.status === 'idle'}
						<button class="sign-btn" onclick={() => handleSignBundle(ref.signingId)}>
							Prepare Signing
						</button>
					{:else if bState.status === 'loading'}
						<button class="sign-btn" disabled>Loading bundle...</button>
					{:else if bState.status === 'ready'}
						{#if bundleRainlangReview}
							<button class="review-btn" onclick={() => (isReviewModalOpen = true)}>Review Rainlang Strategy</button>
						{/if}
						<button class="sign-btn" onclick={() => executeBundleSigning(ref.signingId)}>
							Sign {bState.bundle?.transactions.length ?? 0} Transaction{(bState.bundle?.transactions.length ?? 0) === 1 ? '' : 's'}
						</button>
					{:else if bState.status === 'signing'}
						<button class="sign-btn" disabled>
							Signing {bState.currentTxIndex + 1} of {bState.bundle?.transactions.length ?? 0}: {bState.bundle?.transactions[bState.currentTxIndex]?.label ?? ''}...
						</button>
						{#each bState.txHashes as hash, i}
							{@render txHashBox(hash, i, bState.bundle?.chainId ?? DEFAULT_CHAIN_ID)}
						{/each}
					{:else if bState.status === 'completed'}
						{#each bState.txHashes as hash, i}
							{@render txHashBox(hash, i, bState.bundle?.chainId ?? DEFAULT_CHAIN_ID)}
						{/each}
						{#if bState.completionResult?.raindexUrl}
							{@render orderHashBox(bState.completionResult.orderHash ?? '', bState.completionResult.raindexUrl)}
						{/if}
					{:else if bState.status === 'error'}
						<div class="sign-status error">{bState.error}</div>
						{#each bState.txHashes as hash, i}
							{@render txHashBox(hash, i, bState.bundle?.chainId ?? DEFAULT_CHAIN_ID)}
						{/each}
						{#if bState.error?.includes('not found or expired')}
							<div class="sign-status pending">Bundle expired — ask the agent to prepare again.</div>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}
	</div>
	<div class="bubble-time">{timeStr}</div>
</div>

{#if isReviewModalOpen && activeReview}
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
				<h3 id={`rainlang-review-title-${message.id}`}>{activeReview.title}</h3>
				<button class="close-btn" aria-label="Close Rainlang review modal" onclick={() => (isReviewModalOpen = false)}>
					Close
				</button>
			</div>
			<pre class="rainlang-code"><code>{activeReview.rainlang}</code></pre>
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

	.bundle-summary {
		font-size: 0.8rem;
		color: #374151;
		line-height: 1.4;
	}

	.tx-request-card + .tx-request-card {
		border-top: 1px dashed #d1d5db;
		padding-top: 0.5rem;
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

	.hash-link-box {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem;
		border-radius: 0.4rem;
		background: #ecfdf3;
		font-size: 0.76rem;
	}

	.hash-link-box.order {
		background: #eff6ff;
	}

	.hash-link-box .hash-label {
		color: #166534;
		font-weight: 600;
		white-space: nowrap;
	}

	.hash-link-box.order .hash-label {
		color: #1d4ed8;
	}

	.hash-link-box code {
		color: #166534;
		word-break: break-all;
	}

	.hash-link-box.order code {
		color: #1e40af;
	}

	.hash-explorer-link {
		margin-left: auto;
		color: #065f46;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.hash-explorer-link:hover {
		text-decoration: underline;
	}

	.hash-link-box.order .hash-explorer-link {
		color: #1e40af;
	}

	:global(.inline-hash) {
		background: #f0fdf4;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		color: #166534;
		text-decoration: none;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.85em;
	}

	:global(.inline-hash:hover) {
		text-decoration: underline;
		background: #dcfce7;
	}

	.user :global(.inline-hash) {
		background: rgba(255, 255, 255, 0.2);
		color: #ffffff;
	}

	.user :global(.inline-hash:hover) {
		background: rgba(255, 255, 255, 0.3);
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

	.sign-status.pending {
		background: #eff6ff;
		color: #1d4ed8;
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
		z-index: 10001;
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
