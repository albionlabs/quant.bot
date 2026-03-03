<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { ChatWidget, setAuth, clearAuth, auth } from '@quant-bot/chat-widget'
	import {
		dynamicSession,
		dynamicLoading,
		dynamicError,
		dynamicReady,
		dynamicWalletProvider,
		dynamicDelegationComplete,
		loginWithDynamic,
		logoutDynamic,
		triggerDelegation
	} from '$lib/stores/dynamicStore'
	import { createSiweMessage, generateNonce } from '$lib/siwe'
	import { getDelegationStatus, revokeDelegation } from '$lib/delegation'
	import type { DelegationStatusResponse } from '@quant-bot/shared-types'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const wsUrl = gatewayUrl.replace(/^http/, 'ws')

	let error = $state<string | null>(null)
	let signingIn = $state(false)
	let delegating = $state(false)
	let delegationStatus = $state<DelegationStatusResponse | null>(null)
	let loadingDelegation = $state(false)
	let lastStatusToken = $state<string | null>(null)
	let delegationWatchdog: ReturnType<typeof setTimeout> | null = null
	const DELEGATION_UI_TIMEOUT_MS = 120_000

	// When Dynamic authenticates, auto-SIWE to gateway
	let lastSignedAddress: string | null = null
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

			// Fetch delegation status
			try {
				delegationStatus = await getDelegationStatus(gatewayUrl, token)
			} catch (e) {
				error = e instanceof Error
					? `Signed in, but failed to fetch delegation status: ${e.message}`
					: 'Signed in, but failed to fetch delegation status'
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed'
			lastSignedAddress = null
		} finally {
			signingIn = false
		}
	}

	function clearDelegationWatchdog() {
		if (delegationWatchdog) {
			clearTimeout(delegationWatchdog)
			delegationWatchdog = null
		}
	}

	function startDelegationWatchdog() {
		clearDelegationWatchdog()
		delegationWatchdog = setTimeout(() => {
			if (delegating) {
				delegating = false
				error = 'Delegation timed out. Check your connection and retry.'
			}
		}, DELEGATION_UI_TIMEOUT_MS)
	}

	// When delegation completes (webhook fires → gateway stores it), refresh status
	$effect(() => {
		if ($dynamicDelegationComplete && $auth.token) {
			delegating = false
			clearDelegationWatchdog()
			// Give the webhook a moment to be processed by gateway
			setTimeout(() => fetchDelegationStatus(), 2000)
		}
	})

	$effect(() => {
		if ($dynamicError && delegating) {
			delegating = false
			clearDelegationWatchdog()
		}
	})

	// Ensure delegation status is fetched whenever auth token becomes available.
	$effect(() => {
		const token = $auth.token
		if (!token) {
			lastStatusToken = null
			return
		}
		if (token === lastStatusToken) return
		lastStatusToken = token
		fetchDelegationStatus()
	})

	function handleDelegate() {
		delegating = true
		error = null
		startDelegationWatchdog()
		triggerDelegation()
	}

	function handleLogin() {
		error = null
		loginWithDynamic()
	}

	function handleDisconnect() {
		logoutDynamic()
		clearAuth()
		delegationStatus = null
		error = null
		lastSignedAddress = null
		clearDelegationWatchdog()
	}

	async function handleRevokeDelegation() {
		if (!$auth.token) return
		try {
			await revokeDelegation(gatewayUrl, $auth.token)
			const status = await getDelegationStatus(gatewayUrl, $auth.token)
			delegationStatus = status
			if (status.active) {
				error = 'Delegation is still active after revoke attempt. Please retry.'
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to revoke delegation'
		}
	}

	async function fetchDelegationStatus() {
		if (!$auth.token) return
		loadingDelegation = true
		try {
			delegationStatus = await getDelegationStatus(gatewayUrl, $auth.token)
			if (delegationStatus.active) {
				delegating = false
				clearDelegationWatchdog()
			}
		} catch (e) {
			delegationStatus = null
			error = e instanceof Error ? e.message : 'Failed to fetch delegation status'
		} finally {
			loadingDelegation = false
		}
	}
</script>

<div class="page">
	{#if $auth.authenticated}
		<div class="status-bar">
			<span class="addr">{$auth.address?.slice(0, 6)}...{$auth.address?.slice(-4)}</span>
			<div class="status-bar-actions">
				{#if delegationStatus?.active}
					<span class="delegation-badge active">Delegation Active</span>
					<button class="btn btn-sm btn-secondary" onclick={handleRevokeDelegation}>Revoke</button>
				{:else}
					<span class="delegation-badge inactive">No Delegation</span>
					<button class="btn btn-sm" onclick={handleDelegate} disabled={delegating}>
						{delegating ? 'Delegating...' : 'Delegate'}
					</button>
					<button class="btn btn-sm btn-secondary" onclick={fetchDelegationStatus} disabled={loadingDelegation}>
						{loadingDelegation ? 'Checking...' : 'Refresh'}
					</button>
				{/if}
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

	.delegation-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		border-radius: 0.25rem;
	}

	.delegation-badge.active {
		background: #dcfce7;
		color: #166534;
	}

	.delegation-badge.inactive {
		background: #f3f4f6;
		color: #6b7280;
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

	.btn-secondary {
		background: transparent;
		color: #6b7280;
		border: 1px solid #d1d5db;
	}

	.btn-secondary:hover {
		background: #f3f4f6;
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
