<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import ChatWidget from './ChatWidget.svelte';
	import AlbionMark from './components/AlbionMark.svelte';
	import WalletStatusIndicator from './components/WalletStatusIndicator.svelte';
	import { chat, connect, reconnect } from './stores/chat.js';
	import { auth, setAuth } from './stores/auth.js';
	import { walletProvider } from './stores/wallet.js';
	import { setGatewayBaseUrl, login } from './services/gateway-api.js';
	import { createSiweMessage, generateNonce } from './services/siwe.js';
	import { getThemeStyle } from './theme.js';
	import type { FloatingChatWidgetConfig, FloatingChatCallbacks, ChatWidgetConfig } from './types.js';

	let {
		config,
		callbacks = {}
	}: {
		config: FloatingChatWidgetConfig;
		callbacks?: FloatingChatCallbacks;
	} = $props();

	const name = $derived(config.name ?? 'quant.bot');
	const position = $derived(config.position ?? 'bottom-right');
	const offset = $derived(config.offset ?? { x: 24, y: 24 });
	const theme = $derived(config.theme ?? 'dark');
	const themeStyle = $derived(getThemeStyle(theme));
	const fabMarqueVariant = $derived(theme === 'light' ? 'dark' : 'light');

	let isOpen = $state(false);
	let unreadCount = $state(0);
	let lastSeenMessageCount = $state(0);
	let signingIn = $state(false);
	let siweError = $state<string | null>(null);
	let siweDismissed = $state(false);
	let expanded = $state(false);

	const httpBaseUrl = $derived(
		config.gatewayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
	);
	const wsUrl = $derived(
		config.gatewayUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
	);

	const chatConfig = $derived<ChatWidgetConfig>({
		gatewayUrl: wsUrl,
		token: $auth.token ?? undefined,
		theme,
		name
	});

	// Track unread messages while collapsed
	$effect(() => {
		const messages = $chat.messages;
		if (isOpen) {
			lastSeenMessageCount = messages.length;
			unreadCount = 0;
		} else {
			const newMessages = messages.slice(lastSeenMessageCount);
			const newAssistant = newMessages.filter((m) => m.role === 'assistant').length;
			if (newAssistant > 0) {
				unreadCount += newAssistant;
			}
			lastSeenMessageCount = messages.length;
		}
	});

	// Auto-trigger SIWE when wallet appears, not authed, and widget is open
	$effect(() => {
		const provider = $walletProvider;
		const authenticated = $auth.authenticated;
		if (provider && !authenticated && !signingIn && !siweDismissed && isOpen) {
			handleSiweLogin();
		}
	});

	// Reset dismissed state when wallet provider changes
	$effect(() => {
		$walletProvider;
		siweDismissed = false;
	});

	// Close expanded modal on Escape
	$effect(() => {
		if (!expanded) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') expanded = false;
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	// When auth completes, connect WebSocket
	$effect(() => {
		const authenticated = $auth.authenticated;
		const token = $auth.token;
		if (authenticated && token) {
			connect(wsUrl, token, config.apiKey);
		}
	});

	onMount(() => {
		setGatewayBaseUrl(httpBaseUrl, config.apiKey);
		if (config.startOpen) {
			isOpen = true;
		}
	});

	function toggle() {
		isOpen = !isOpen;
		if (isOpen) {
			unreadCount = 0;
			lastSeenMessageCount = get(chat).messages.length;
			callbacks.onOpen?.();
		} else {
			expanded = false;
			callbacks.onClose?.();
		}
	}

	async function handleSiweLogin() {
		const provider = get(walletProvider);
		if (!provider || signingIn) return;

		siweError = null;
		siweDismissed = false;
		signingIn = true;

		try {
			// Get wallet address
			const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
			const walletAddress = accounts?.[0];
			if (!walletAddress) throw new Error('No wallet address available');

			const message = createSiweMessage({
				domain: window.location.host,
				address: walletAddress,
				uri: window.location.origin,
				chainId: 1,
				nonce: generateNonce(),
				statement: `Sign in to ${name}`
			});

			const signature = await provider.request({
				method: 'personal_sign',
				params: [message, walletAddress]
			}) as string;

			const result = await login(signature, message, walletAddress);
			setAuth(result.token, walletAddress, result.user.id);
		} catch (e) {
			siweError = e instanceof Error ? e.message : 'Sign-in failed';
			siweDismissed = true;
		} finally {
			signingIn = false;
		}
	}
</script>

{#snippet panelBody()}
	{#if !$walletProvider && !$auth.authenticated}
		<div class="auth-prompt">
			<p>Connect your wallet to sign in</p>
			<button class="connect-wallet-btn" onclick={() => callbacks.onRequestWalletConnect?.()}>
				Connect Wallet
			</button>
		</div>
	{:else if signingIn}
		<div class="auth-prompt">
			<p>Signing in...</p>
			<div class="spinner"></div>
		</div>
	{:else if siweError}
		<div class="auth-prompt">
			<p class="error-text">{siweError}</p>
			<button class="connect-wallet-btn" onclick={handleSiweLogin}>
				Retry Sign In
			</button>
		</div>
	{:else if $auth.authenticated}
		<ChatWidget config={chatConfig} hideHeader={true} manageLifecycle={false} />
	{:else}
		<div class="auth-prompt">
			<p>Preparing sign-in...</p>
			<div class="spinner"></div>
		</div>
	{/if}
{/snippet}

<div
	class="floating-container"
	class:bottom-right={position === 'bottom-right'}
	class:bottom-left={position === 'bottom-left'}
	style="--offset-x: {offset.x}px; --offset-y: {offset.y}px; {themeStyle}"
>
	<!-- Chat Panel (hidden while expanded modal is open) -->
	{#if !expanded}
		<div class="chat-panel" class:open={isOpen}>
			<div class="panel-header">
				<div class="panel-brand">
					<AlbionMark size={18} variant="light" />
					<span class="panel-title">{name}</span>
				</div>
				<WalletStatusIndicator onRequestWalletConnect={callbacks.onRequestWalletConnect} />
				{#if $chat.reconnecting}
					<span class="status-dot reconnecting"></span>
				{:else if $auth.authenticated}
					<span class="status-dot" class:connected={$chat.connected}></span>
					{#if !$chat.connected}
						<button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
					{/if}
				{/if}
				{#if $chat.connected && $chat.backendVersion}
					<span class="version-label">v {$chat.backendVersion}</span>
				{/if}
				{#if isOpen && !expanded}
					<button
						class="expand-btn"
						onclick={() => {
							unreadCount = 0;
							lastSeenMessageCount = get(chat).messages.length;
							expanded = true;
						}}
						aria-label="Expand chat to full screen"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
							<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{/if}
				<button class="close-btn" onclick={toggle} aria-label="Close chat">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="panel-body">
				{@render panelBody()}
			</div>
		</div>
	{/if}

	<!-- Floating Bubble -->
	<button class="chat-bubble-btn" onclick={toggle} aria-label={isOpen ? 'Close chat' : 'Open chat'}>
		{#if isOpen}
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
		{:else}
			<AlbionMark size={28} variant={fabMarqueVariant} />
		{/if}
		{#if unreadCount > 0 && !isOpen}
			<span class="unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
		{/if}
	</button>
</div>

{#if expanded}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="expand-backdrop"
		style={themeStyle}
		onclick={() => (expanded = false)}
		aria-hidden="true"
	>
		<div
			class="expand-modal"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label="{name} — expanded"
		>
			<div class="expand-modal-header">
				<div class="panel-brand">
					<AlbionMark size={18} variant="light" />
					<span class="panel-title">{name}</span>
				</div>
				<WalletStatusIndicator onRequestWalletConnect={callbacks.onRequestWalletConnect} />
				{#if $chat.reconnecting}
					<span class="status-dot reconnecting"></span>
				{:else if $auth.authenticated}
					<span class="status-dot" class:connected={$chat.connected}></span>
					{#if !$chat.connected}
						<button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
					{/if}
				{/if}
				{#if $chat.connected && $chat.backendVersion}
					<span class="version-label">v {$chat.backendVersion}</span>
				{/if}
				<button class="close-btn" onclick={() => (expanded = false)} aria-label="Close expanded chat">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
			<div class="expand-modal-body">
				{@render panelBody()}
			</div>
		</div>
	</div>
{/if}

<style>
	.floating-container {
		position: fixed;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
		pointer-events: none;
	}

	.floating-container.bottom-right {
		bottom: var(--offset-y);
		right: var(--offset-x);
	}

	.floating-container.bottom-left {
		bottom: var(--offset-y);
		left: var(--offset-x);
		align-items: flex-start;
	}

	.chat-panel {
		width: 400px;
		height: 600px;
		max-width: calc(100vw - 48px);
		max-height: calc(100vh - 120px);
		border-radius: 0.75rem;
		border: 1px solid var(--cw-border);
		background: var(--cw-bg);
		box-shadow: var(--cw-shadow);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transform: scale(0.95) translateY(10px);
		opacity: 0;
		pointer-events: none;
		transition: transform 0.2s ease, opacity 0.2s ease;
	}

	.chat-panel.open {
		transform: scale(1) translateY(0);
		opacity: 1;
		pointer-events: auto !important;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: var(--cw-header-bg);
		color: white;
		flex-shrink: 0;
	}

	.panel-title {
		font-weight: 600;
		font-size: 0.85rem;
	}

	.status-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #ef4444;
		flex-shrink: 0;
	}

	.status-dot.connected {
		background: #22c55e;
	}

	.status-dot.reconnecting {
		background: #f59e0b;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.panel-brand {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.reconnect-btn {
		font-size: 0.65rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid #6b7280;
		border-radius: 0.25rem;
		background: transparent;
		color: white;
		cursor: pointer;
	}

	.reconnect-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.version-label {
		margin-left: auto;
		font-size: 0.6rem;
		font-family: monospace;
		color: #9ca3af;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 0.25rem;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		flex-shrink: 0;
	}

	.close-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 0.25rem;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		flex-shrink: 0;
	}

	.expand-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.panel-body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.auth-prompt {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		color: var(--cw-text-secondary);
		font-size: 0.875rem;
	}

	.auth-prompt p {
		margin: 0;
		text-align: center;
	}

	.error-text {
		color: #dc2626;
	}

	.connect-wallet-btn {
		padding: 0.45rem 1rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--cw-btn-secondary-bg);
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.connect-wallet-btn:hover {
		background: var(--cw-btn-secondary-hover);
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid var(--cw-spinner-track);
		border-top-color: var(--cw-spinner-head);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.chat-bubble-btn {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: var(--cw-fab-border);
		background: var(--cw-fab-bg);
		color: var(--cw-fab-text);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--cw-fab-shadow);
		position: relative;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		flex-shrink: 0;
		pointer-events: auto;
	}

	.chat-bubble-btn:hover {
		transform: scale(1.05);
		box-shadow: var(--cw-fab-shadow-hover);
	}

	.unread-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 1.1rem;
		height: 1.1rem;
		border-radius: 9999px;
		background: #ef4444;
		color: white;
		font-size: 0.65rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.25rem;
		line-height: 1;
	}

	@media (max-width: 480px) {
		.chat-panel {
			width: calc(100vw - 24px);
			height: calc(100vh - 100px);
			max-width: none;
		}
	}

	.expand-backdrop {
		position: fixed;
		inset: 0;
		background: var(--cw-backdrop, rgba(0, 0, 0, 0.5));
		z-index: 10002;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
	}

	.expand-modal {
		/* position: absolute (not fixed) — backdrop is already fixed + inset:0,
		   so absolute inset:24px is visually equivalent to fixed inset:24px but
		   avoids a fixed-in-fixed stacking context that breaks if backdrop ever
		   gets a transform or will-change applied */
		position: absolute;
		inset: 24px;
		z-index: 10003;
		background: var(--cw-bg);
		border: 1px solid var(--cw-border);
		border-radius: 0.75rem;
		box-shadow: var(--cw-shadow);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.expand-modal-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: var(--cw-header-bg);
		color: white;
		flex-shrink: 0;
	}

	.expand-modal-body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 480px) {
		.expand-modal {
			inset: 8px;
		}
	}
</style>
