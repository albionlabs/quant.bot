<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { ChatWidget, setAuth, clearAuth, auth, setWalletProvider } from '@quant-bot/chat-widget'
	import {
		dynamicSession,
		dynamicLoading,
		dynamicError,
		dynamicReady,
		dynamicWalletProvider,
		loginWithDynamic,
		logoutDynamic
	} from '$lib/stores/dynamicStore'
	import { createSiweMessage, generateNonce } from '$lib/siwe'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const wsUrl = gatewayUrl.replace(/^http/, 'ws')

	let error = $state<string | null>(null)
	let signingIn = $state(false)

	// When Dynamic authenticates, auto-SIWE to gateway
	let lastSignedAddress: string | null = null
	$effect(() => {
		setWalletProvider($dynamicWalletProvider)
	})

	$effect(() => {
		const session = $dynamicSession
		if (session?.walletAddress && session.walletAddress !== lastSignedAddress && !signingIn && !$auth.authenticated) {
			lastSignedAddress = session.walletAddress
			handleSiweLogin(session.walletAddress)
		}
	})

	async function handleSiweLogin(walletAddress: string) {
		error = null
		signingIn = true

		try {
			const message = createSiweMessage({
				domain: window.location.host,
				address: walletAddress,
				uri: window.location.origin,
				chainId: 1,
				nonce: generateNonce(),
				statement: 'Sign in to quant.bot'
			})

			const provider = $dynamicWalletProvider
			if (!provider) throw new Error('Wallet provider not ready')

			const signature = await provider.request({
				method: 'personal_sign',
				params: [message, walletAddress]
			}) as string

			const res = await fetch(`${gatewayUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signature, message, address: walletAddress })
			})

			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				throw new Error(body.error ?? `Login failed (${res.status})`)
			}

			const { token, user } = await res.json()
			setAuth(token, walletAddress, user.id)
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed'
			lastSignedAddress = null
		} finally {
			signingIn = false
		}
	}

	function handleLogin() {
		error = null
		loginWithDynamic()
	}

	function handleDisconnect() {
		logoutDynamic()
		clearAuth()
		error = null
		lastSignedAddress = null
	}
</script>

<div class="page">
	{#if $auth.authenticated}
		<div class="status-bar">
			<span class="addr">{$auth.address?.slice(0, 6)}...{$auth.address?.slice(-4)}</span>
			<div class="status-bar-actions">
				<button class="btn btn-sm" onclick={handleDisconnect}>Disconnect</button>
			</div>
		</div>
		<div class="chat-container">
			<ChatWidget config={{ gatewayUrl: wsUrl, token: $auth.token ?? undefined }} />
		</div>
	{:else if signingIn}
		<div class="card">
			<p class="hint">Signing in...</p>
			<div class="spinner"></div>
		</div>
	{:else}
		<div class="card">
			<p class="hint">Sign in with email or social to get started</p>
			<button class="btn" onclick={handleLogin} disabled={$dynamicLoading || !$dynamicReady}>
				{#if $dynamicLoading}
					Loading...
				{:else}
					Sign In
				{/if}
			</button>
		</div>
	{/if}

	{#if error || $dynamicError}
		<div class="error">{error || $dynamicError}</div>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
	}

	.status-bar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-container {
		height: 500px;
	}

	.addr {
		font-family: monospace;
		font-size: 0.95rem;
		margin: 0;
	}

	.hint {
		color: #6b7280;
		font-size: 0.9rem;
		margin: 0;
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

	.btn {
		padding: 0.5rem 1.25rem;
		border: none;
		border-radius: 0.5rem;
		background: #1f2937;
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn:hover {
		background: #374151;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-sm {
		padding: 0.25rem 0.75rem;
		font-size: 0.8rem;
	}

	.error {
		padding: 0.75rem 1rem;
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}
</style>
