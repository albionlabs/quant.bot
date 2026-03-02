<script lang="ts">
	import { onMount } from 'svelte'
	import { env } from '$env/dynamic/public'
	import { ChatWidget, setAuth, clearAuth, auth } from '@quant-bot/chat-widget'
	import {
		getWalletState,
		initDynamic,
		startEmailLogin,
		completeEmailLogin,
		signSiweMessage,
		delegateAccess,
		checkDelegated,
		revokeDynamic,
		disconnect
	} from '$lib/wallet.svelte'
	import { createSiweMessage, generateNonce } from '$lib/siwe'
	import { getDelegationStatus, revokeDelegation } from '$lib/delegation'
	import type { DelegationStatusResponse } from '@quant-bot/shared-types'
	import type { OTPVerification } from '@dynamic-labs-sdk/client'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const wsUrl = gatewayUrl.replace(/^http/, 'ws')

	const wallet = getWalletState()

	type UiState = 'email' | 'otp' | 'signing' | 'authenticated'

	let uiState = $state<UiState>('email')
	let email = $state('')
	let otpCode = $state('')
	let otpVerification = $state<OTPVerification | null>(null)
	let error = $state<string | null>(null)
	let loading = $state(false)
	let delegationStatus = $state<DelegationStatusResponse | null>(null)
	let loadingDelegation = $state(false)

	onMount(() => {
		const envId = env.PUBLIC_DYNAMIC_ENVIRONMENT_ID
		if (envId) {
			initDynamic(envId)
		}
	})

	async function handleSendOtp() {
		if (!email.trim()) return
		error = null
		loading = true
		try {
			otpVerification = await startEmailLogin(email.trim())
			uiState = 'otp'
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to send OTP'
		} finally {
			loading = false
		}
	}

	async function handleVerifyOtp() {
		if (!otpCode.trim() || !otpVerification) return
		error = null
		loading = true
		uiState = 'signing'
		try {
			await completeEmailLogin(otpVerification, otpCode.trim())

			if (!wallet.address) throw new Error('No wallet address after login')

			const message = createSiweMessage({
				domain: window.location.host,
				address: wallet.address,
				uri: window.location.origin,
				chainId: 1,
				nonce: generateNonce(),
				statement: 'Sign in to quant.bot'
			})

			const signature = await signSiweMessage(message)

			const res = await fetch(`${gatewayUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					signature,
					message,
					address: wallet.address
				})
			})

			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				throw new Error(body.error ?? `Login failed (${res.status})`)
			}

			const { token, user } = await res.json()
			setAuth(token, wallet.address, user.id)

			uiState = 'authenticated'

			// Fetch delegation status and auto-delegate if needed
			try {
				delegationStatus = await getDelegationStatus(gatewayUrl, token)
				if (!delegationStatus.active && !checkDelegated()) {
					await delegateAccess()
					delegationStatus = await getDelegationStatus(gatewayUrl, token)
				}
			} catch {
				// Non-fatal — delegation can be retried
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed'
			uiState = 'otp'
		} finally {
			loading = false
		}
	}

	function handleBack() {
		uiState = 'email'
		otpCode = ''
		otpVerification = null
		error = null
	}

	async function handleDisconnect() {
		await disconnect()
		clearAuth()
		delegationStatus = null
		error = null
		email = ''
		otpCode = ''
		otpVerification = null
		uiState = 'email'
	}

	async function handleRevokeDelegation() {
		if (!$auth.token) return
		try {
			await revokeDelegation(gatewayUrl, $auth.token)
			await revokeDynamic()
			delegationStatus = { active: false }
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to revoke delegation'
		}
	}

	async function fetchDelegationStatus() {
		if (!$auth.token) return
		loadingDelegation = true
		try {
			delegationStatus = await getDelegationStatus(gatewayUrl, $auth.token)
		} catch {
			delegationStatus = null
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
					<button class="btn btn-sm" onclick={fetchDelegationStatus} disabled={loadingDelegation}>
						{loadingDelegation ? 'Checking...' : 'Refresh'}
					</button>
				{/if}
				<button class="btn btn-sm" onclick={handleDisconnect}>Disconnect</button>
			</div>
		</div>
		<div class="chat-container">
			<ChatWidget config={{ gatewayUrl: wsUrl, token: $auth.token ?? undefined }} />
		</div>
	{:else if uiState === 'otp'}
		<div class="card">
			<p class="hint">Enter the code sent to <strong>{email}</strong></p>
			<input
				class="input"
				type="text"
				inputmode="numeric"
				placeholder="Enter OTP code"
				bind:value={otpCode}
				onkeydown={(e) => e.key === 'Enter' && handleVerifyOtp()}
			/>
			<button class="btn" onclick={handleVerifyOtp} disabled={loading || !otpCode.trim()}>
				{loading ? 'Verifying...' : 'Verify'}
			</button>
			<button class="btn btn-secondary" onclick={handleBack} disabled={loading}>Back</button>
		</div>
	{:else if uiState === 'signing'}
		<div class="card">
			<p class="hint">Signing in...</p>
			<div class="spinner"></div>
		</div>
	{:else}
		<div class="card">
			<p class="hint">Enter your email to get started</p>
			<input
				class="input"
				type="email"
				placeholder="you@example.com"
				bind:value={email}
				onkeydown={(e) => e.key === 'Enter' && handleSendOtp()}
			/>
			<button class="btn" onclick={handleSendOtp} disabled={loading || !email.trim()}>
				{loading ? 'Sending...' : 'Continue'}
			</button>
		</div>
	{/if}

	{#if error}
		<div class="error">{error}</div>
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

	.input {
		width: 100%;
		max-width: 300px;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		outline: none;
	}

	.input:focus {
		border-color: #1f2937;
		box-shadow: 0 0 0 1px #1f2937;
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
