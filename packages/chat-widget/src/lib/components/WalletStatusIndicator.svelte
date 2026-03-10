<script lang="ts">
	import { walletProvider } from '../stores/wallet.js';
	import { auth } from '../stores/auth.js';

	let {
		onRequestWalletConnect
	}: {
		onRequestWalletConnect?: () => void;
	} = $props();

	const hasWallet = $derived(!!$walletProvider);
	const truncatedAddress = $derived(
		$auth.address ? `${$auth.address.slice(0, 6)}...${$auth.address.slice(-4)}` : null
	);
</script>

<div class="wallet-status">
	{#if $auth.authenticated && truncatedAddress}
		<span class="dot connected"></span>
		<span class="address">{truncatedAddress}</span>
	{:else if hasWallet}
		<span class="dot wallet-ready"></span>
		<span class="label">Wallet connected</span>
	{:else}
		<span class="dot disconnected"></span>
		<button class="connect-btn" onclick={() => onRequestWalletConnect?.()}>
			Connect Wallet
		</button>
	{/if}
</div>

<style>
	.wallet-status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot.connected {
		background: #22c55e;
	}

	.dot.wallet-ready {
		background: #f59e0b;
	}

	.dot.disconnected {
		background: #6b7280;
	}

	.address {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		color: #d1d5db;
	}

	.label {
		font-size: 0.72rem;
		color: #d1d5db;
	}

	.connect-btn {
		font-size: 0.7rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid #6b7280;
		border-radius: 0.25rem;
		background: transparent;
		color: white;
		cursor: pointer;
	}

	.connect-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: #9ca3af;
	}
</style>
