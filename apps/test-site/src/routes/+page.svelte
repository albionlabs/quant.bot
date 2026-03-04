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
		dynamicRevocationComplete,
		dynamicDelegatedStatus,
		loginWithDynamic,
		logoutDynamic,
		triggerDelegation,
		triggerRevocation
	} from '$lib/stores/dynamicStore'
	import { createSiweMessage, generateNonce } from '$lib/siwe'
	import { getDelegationStatus, revokeDelegation } from '$lib/delegation'
	import type { DelegationStatusResponse } from '@quant-bot/shared-types'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const wsUrl = gatewayUrl.replace(/^http/, 'ws')

	let error = $state<string | null>(null)
	let signingIn = $state(false)
	let delegating = $state(false)
	let revoking = $state(false)
	let delegationStatus = $state<DelegationStatusResponse | null>(null)
	let loadingDelegation = $state(false)
	let lastStatusToken = $state<string | null>(null)
	let delegationWatchdog: ReturnType<typeof setTimeout> | null = null
	let revocationRecoveryInFlight = $state(false)
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
				return
			}
			if (revoking) {
				revoking = false
				error = 'Revocation timed out. Check your connection and retry.'
			}
		}, DELEGATION_UI_TIMEOUT_MS)
	}

	async function waitForDelegationState(expectedActive: boolean, timeoutMs = 45_000, intervalMs = 2_000): Promise<boolean> {
		if (!$auth.token) return false
		const deadline = Date.now() + timeoutMs
		while (Date.now() <= deadline) {
			const status = await getDelegationStatus(gatewayUrl, $auth.token)
			delegationStatus = status
			if (status.active === expectedActive) {
				return true
			}
			await new Promise((resolve) => setTimeout(resolve, intervalMs))
		}
		return false
	}

	async function waitForDynamicDelegationState(expectedDelegated: boolean, timeoutMs = 20_000, intervalMs = 500): Promise<boolean> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() <= deadline) {
			const delegated = $dynamicDelegatedStatus
			if (delegated !== null && delegated === expectedDelegated) {
				return true
			}
			await new Promise((resolve) => setTimeout(resolve, intervalMs))
		}
		return false
	}

	async function recoverRevocationAfterSdkError(initialMessage: string) {
		if (!$auth.token || revocationRecoveryInFlight) return
		revocationRecoveryInFlight = true

		try {
			let syncedViaWebhook = false
			try {
				syncedViaWebhook = await waitForDelegationState(false, 20_000, 2_000)
			} catch {
				syncedViaWebhook = false
			}

			if (!syncedViaWebhook) {
				const walletShowsRevoked = await waitForDynamicDelegationState(false, 20_000, 500)
				if (!walletShowsRevoked) {
					throw new Error('Delegation is still active in wallet. Please retry.')
				}

				// Dynamic can complete revoke before webhook propagation. Reconcile backend state.
				await revokeDelegation(gatewayUrl, $auth.token)
				const syncedAfterReconcile = await waitForDelegationState(false, 20_000, 2_000)
				if (!syncedAfterReconcile) {
					throw new Error('Revocation completed in wallet, but backend status did not reconcile yet.')
				}
			}

			error = null
		} catch (e) {
			const recoveryMessage = e instanceof Error ? e.message : 'Failed to reconcile revocation status'
			error = `${initialMessage}. ${recoveryMessage}`
		} finally {
			revoking = false
			revocationRecoveryInFlight = false
			clearDelegationWatchdog()
			dynamicError.set(null)
		}
	}

	// When delegation completes (webhook fires → gateway stores it), refresh status
	$effect(() => {
		if ($dynamicDelegationComplete && $auth.token) {
			delegating = false
			clearDelegationWatchdog()
			void (async () => {
				try {
					const synced = await waitForDelegationState(true)
					if (!synced) {
						error = 'Delegation completed in wallet, but status sync timed out. Please refresh.'
					}
				} catch (e) {
					error = e instanceof Error ? e.message : 'Failed to refresh delegation status'
				}
			})()
		}
	})

	// When revoke completes in Dynamic, clear local delegation record then refresh status
	$effect(() => {
		if ($dynamicRevocationComplete && $auth.token) {
			revoking = false
			clearDelegationWatchdog()
			void (async () => {
				try {
					await revokeDelegation(gatewayUrl, $auth.token)
					const synced = await waitForDelegationState(false)
					if (!synced) {
						error = 'Revocation completed in wallet, but status sync timed out. Please refresh.'
					}
				} catch (e) {
					error = e instanceof Error ? e.message : 'Failed to revoke delegation'
				}
			})()
		}
	})

	$effect(() => {
		const sdkError = $dynamicError
		if (!sdkError) return

		if (revoking) {
			void recoverRevocationAfterSdkError(sdkError)
			return
		}

		if (delegating) {
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
		if (delegating || revoking) return
		delegating = true
		error = null
		dynamicError.set(null)
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
		dynamicDelegatedStatus.set(null)
		error = null
		lastSignedAddress = null
		delegating = false
		revoking = false
		clearDelegationWatchdog()
	}

	async function handleRevokeDelegation() {
		if (delegating || revoking) return
		revoking = true
		error = null
		dynamicError.set(null)
		startDelegationWatchdog()
		triggerRevocation()
	}

	async function fetchDelegationStatus() {
		if (!$auth.token) return
		loadingDelegation = true
		try {
			delegationStatus = await getDelegationStatus(gatewayUrl, $auth.token)
			if (delegationStatus.active) {
				delegating = false
				clearDelegationWatchdog()
			} else if (revoking) {
				revoking = false
				clearDelegationWatchdog()
			}
		} catch (e) {
			delegationStatus = null
			error = e instanceof Error ? e.message : 'Failed to fetch delegation status'
		} finally {
			loadingDelegation = false
		}
	}

	function isDelegationActiveUi(): boolean {
		return Boolean(delegationStatus?.active || $dynamicDelegatedStatus === true)
	}

	function isDelegationOutOfSync(): boolean {
		return $dynamicDelegatedStatus === true && !delegationStatus?.active
	}
</script>

<div class="page">
	{#if $auth.authenticated}
		<div class="status-bar">
			<span class="addr">{$auth.address?.slice(0, 6)}...{$auth.address?.slice(-4)}</span>
				<div class="status-bar-actions">
					{#if isDelegationActiveUi()}
						<span class="delegation-badge active">
							{#if isDelegationOutOfSync()}
								Delegation Active (Re-sync Needed)
							{:else}
								Delegation Active
							{/if}
						</span>
						{#if isDelegationOutOfSync()}
							<button class="btn btn-sm btn-secondary" onclick={handleDelegate} disabled={delegating || revoking}>
								{delegating ? 'Re-syncing...' : 'Re-sync'}
							</button>
						{/if}
						<button class="btn btn-sm btn-secondary" onclick={handleRevokeDelegation} disabled={revoking || delegating}>
							{revoking ? 'Revoking...' : 'Revoke'}
						</button>
						<button class="btn btn-sm btn-secondary" onclick={fetchDelegationStatus} disabled={loadingDelegation || delegating || revoking}>
							{loadingDelegation ? 'Checking...' : 'Refresh'}
						</button>
					{:else}
						<span class="delegation-badge inactive">No Delegation</span>
						<button class="btn btn-sm" onclick={handleDelegate} disabled={delegating || revoking}>
							{delegating ? 'Delegating...' : 'Delegate'}
						</button>
						<button class="btn btn-sm btn-secondary" onclick={fetchDelegationStatus} disabled={loadingDelegation || delegating || revoking}>
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
