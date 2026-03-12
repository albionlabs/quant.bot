<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { ChatWidgetFloating, setWalletProvider, clearWalletProvider } from '@albionlabs/chat-widget'
	import {
		dynamicWalletProvider,
		dynamicSession,
		loginWithDynamic,
		logoutDynamic
	} from '$lib/stores/dynamicStore'
	import {
		wagmiWalletProvider,
		wagmiAddress,
		wagmiConnecting,
		wagmiError,
		connectWithWagmi,
		disconnectWagmi
	} from '$lib/stores/wagmiStore'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const apiKey = env.PUBLIC_WIDGET_API_KEY ?? ''

	let activeSource: 'dynamic' | 'wagmi' | null = $state(null)
	let widgetTheme: 'light' | 'dark' = $state('dark')

	$effect(() => {
		if ($dynamicWalletProvider) {
			activeSource = 'dynamic'
			setWalletProvider($dynamicWalletProvider)
		} else if (activeSource === 'dynamic') {
			activeSource = null
			clearWalletProvider()
		}
	})

	$effect(() => {
		if ($wagmiWalletProvider) {
			activeSource = 'wagmi'
			setWalletProvider($wagmiWalletProvider)
		} else if (activeSource === 'wagmi') {
			activeSource = null
			clearWalletProvider()
		}
	})

	function handleDisconnect() {
		if (activeSource === 'dynamic') {
			logoutDynamic()
		} else if (activeSource === 'wagmi') {
			disconnectWagmi()
		}
	}

	const connectedAddress = $derived(
		activeSource === 'dynamic'
			? $dynamicSession?.walletAddress ?? null
			: activeSource === 'wagmi'
				? $wagmiAddress
				: null
	)

	function truncateAddress(addr: string): string {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`
	}
</script>

<div class="page">
	<div class="card">
		<h2>Wallet Connection</h2>

		{#if connectedAddress}
			<div class="connected">
				<span class="dot green"></span>
				<span class="address">{truncateAddress(connectedAddress)}</span>
				<span class="source">via {activeSource}</span>
				<button class="btn btn-secondary" onclick={handleDisconnect}>Disconnect</button>
			</div>
		{:else}
			<p class="subtitle">Connect a wallet to use the chat widget</p>
			<div class="connect-buttons">
				<button class="btn btn-primary" onclick={() => loginWithDynamic()}>
					Connect with Dynamic
				</button>
				<button
					class="btn btn-primary"
					onclick={() => connectWithWagmi()}
					disabled={$wagmiConnecting}
				>
					{$wagmiConnecting ? 'Connecting...' : 'Connect Browser Wallet'}
				</button>
			</div>
			{#if $wagmiError}
				<p class="error">{$wagmiError}</p>
			{/if}
		{/if}
	</div>

	<div class="card">
		<h2>Widget Theme</h2>
		<div class="connect-buttons">
			<button
				class="btn"
				class:btn-primary={widgetTheme === 'light'}
				class:btn-secondary={widgetTheme !== 'light'}
				onclick={() => (widgetTheme = 'light')}
			>
				Light
			</button>
			<button
				class="btn"
				class:btn-primary={widgetTheme === 'dark'}
				class:btn-secondary={widgetTheme !== 'dark'}
				onclick={() => (widgetTheme = 'dark')}
			>
				Dark
			</button>
		</div>
	</div>

	<p class="hint">Floating chat widget is in the bottom-right corner.</p>
</div>

<ChatWidgetFloating
	config={{ gatewayUrl, apiKey, theme: widgetTheme }}
	callbacks={{ onRequestWalletConnect: () => connectWithWagmi() }}
/>

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

	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.subtitle {
		color: #6b7280;
		font-size: 0.85rem;
		margin: 0;
	}

	.connect-buttons {
		display: flex;
		gap: 0.75rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		cursor: pointer;
		border: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #1f2937;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #374151;
	}

	.btn-secondary {
		background: white;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.btn-secondary:hover {
		background: #f3f4f6;
	}

	.connected {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot.green {
		background: #10b981;
	}

	.address {
		font-family: monospace;
		font-weight: 600;
	}

	.source {
		color: #9ca3af;
	}

	.error {
		color: #dc2626;
		font-size: 0.8rem;
		margin: 0;
	}

	.hint {
		color: #9ca3af;
		font-size: 0.8rem;
		text-align: center;
		margin: 0;
	}
</style>
