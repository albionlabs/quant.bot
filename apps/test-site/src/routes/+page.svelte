<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { ChatWidget, setAuth, clearAuth, auth } from '@quant-bot/chat-widget';
	import { getWallet, getClient, connectWallet, disconnectWallet } from '$lib/wallet.svelte';
	import { createSiweMessage, generateNonce } from '$lib/siwe';
	import { getDelegationStatus, revokeDelegation } from '$lib/delegation';
	import type { DelegationStatusResponse } from '@quant-bot/shared-types';

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';
	const wsUrl = gatewayUrl.replace(/^http/, 'ws');

	const wallet = getWallet();

	let signing = $state(false);
	let error = $state<string | null>(null);
	let delegationStatus = $state<DelegationStatusResponse | null>(null);
	let loadingDelegation = $state(false);

	async function fetchDelegationStatus() {
		if (!$auth.token) return;
		loadingDelegation = true;
		try {
			delegationStatus = await getDelegationStatus(gatewayUrl, $auth.token);
		} catch {
			delegationStatus = null;
		} finally {
			loadingDelegation = false;
		}
	}

	async function handleRevokeDelegation() {
		if (!$auth.token) return;
		try {
			await revokeDelegation(gatewayUrl, $auth.token);
			delegationStatus = { active: false };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to revoke delegation';
		}
	}

	async function handleConnect() {
		error = null;
		try {
			await connectWallet();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to connect wallet';
		}
	}

	function handleDisconnect() {
		disconnectWallet();
		clearAuth();
		delegationStatus = null;
		error = null;
	}

	async function handleSignIn() {
		const client = getClient();
		if (!wallet.address || !client) return;

		error = null;
		signing = true;

		try {
			const message = createSiweMessage({
				domain: window.location.host,
				address: wallet.address,
				uri: window.location.origin,
				chainId: wallet.chainId,
				nonce: generateNonce(),
				statement: 'Sign in to quant.bot'
			});

			const signature = await client.signMessage({
				account: wallet.address,
				message
			});

			const res = await fetch(`${gatewayUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					signature,
					message,
					address: wallet.address
				})
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `Login failed (${res.status})`);
			}

			const { token, user } = await res.json();
			setAuth(token, wallet.address, user.id);
			// Fetch delegation status after login
			delegationStatus = await getDelegationStatus(gatewayUrl, token);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed';
		} finally {
			signing = false;
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
	{:else if wallet.connected}
		<div class="card">
			<p class="addr">{wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}</p>
			<p class="hint">Sign in to start chatting</p>
			<button class="btn" onclick={handleSignIn} disabled={signing}>
				{signing ? 'Signing...' : 'Sign In with Ethereum'}
			</button>
			<button class="btn btn-secondary" onclick={handleDisconnect}>Disconnect</button>
		</div>
	{:else}
		<div class="card">
			<p class="hint">Connect your wallet to get started</p>
			<button class="btn" onclick={handleConnect}>Connect Wallet</button>
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
