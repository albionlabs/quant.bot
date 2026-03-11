<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import ChatWidget from './ChatWidget.svelte';
	import WalletStatusIndicator from './components/WalletStatusIndicator.svelte';
	import { chat, connect, reconnect } from './stores/chat.js';
	import { auth, setAuth } from './stores/auth.js';
	import { walletProvider } from './stores/wallet.js';
	import { setGatewayBaseUrl, login } from './services/gateway-api.js';
	import { createSiweMessage, generateNonce } from './services/siwe.js';
	import type { FloatingChatWidgetConfig, FloatingChatCallbacks, ChatWidgetConfig } from './types.js';

	let {
		config,
		callbacks = {}
	}: {
		config: FloatingChatWidgetConfig;
		callbacks?: FloatingChatCallbacks;
	} = $props();

	const position = $derived(config.position ?? 'bottom-right');
	const offset = $derived(config.offset ?? { x: 24, y: 24 });

	let isOpen = $state(false);
	let unreadCount = $state(0);
	let lastSeenMessageCount = $state(0);
	let signingIn = $state(false);
	let siweError = $state<string | null>(null);
	let siweDismissed = $state(false);

	const httpBaseUrl = $derived(
		config.gatewayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
	);
	const wsUrl = $derived(
		config.gatewayUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
	);

	const chatConfig = $derived<ChatWidgetConfig>({
		gatewayUrl: wsUrl,
		token: $auth.token ?? undefined
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

	// Auto-trigger SIWE when wallet appears and not authed
	$effect(() => {
		const provider = $walletProvider;
		const authenticated = $auth.authenticated;
		if (provider && !authenticated && !signingIn && !siweDismissed) {
			handleSiweLogin();
		}
	});

	// Reset dismissed state when wallet provider changes
	$effect(() => {
		$walletProvider;
		siweDismissed = false;
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
				statement: 'Sign in to quant.bot'
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

<div
	class="floating-container"
	class:bottom-right={position === 'bottom-right'}
	class:bottom-left={position === 'bottom-left'}
	style="--offset-x: {offset.x}px; --offset-y: {offset.y}px;"
>
	<!-- Chat Panel -->
	<div class="chat-panel" class:open={isOpen}>
		<div class="panel-header">
			<span class="panel-title">quant.bot</span>
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
			<button class="close-btn" onclick={toggle} aria-label="Close chat">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
			</button>
		</div>

		<div class="panel-body">
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
				<ChatWidget config={chatConfig} hideHeader={true} />
			{:else}
				<div class="auth-prompt">
					<p>Preparing sign-in...</p>
					<div class="spinner"></div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Floating Bubble -->
	<button class="chat-bubble-btn" onclick={toggle} aria-label={isOpen ? 'Close chat' : 'Open chat'}>
		{#if isOpen}
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path d="M6 6L18 18M18 6L6 18" stroke="white" stroke-width="2" stroke-linecap="round"/>
			</svg>
		{:else}
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		{/if}
		{#if unreadCount > 0 && !isOpen}
			<span class="unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
		{/if}
	</button>
</div>

<style>
	.floating-container {
		position: fixed;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
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
		border: 1px solid #e5e7eb;
		background: white;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
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
		pointer-events: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: #1f2937;
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
		color: #6b7280;
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
		background: #1f2937;
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.connect-wallet-btn:hover {
		background: #374151;
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid #e5e7eb;
		border-top-color: #1f2937;
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
		border: none;
		background: #1f2937;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		position: relative;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		flex-shrink: 0;
	}

	.chat-bubble-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
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
</style>
