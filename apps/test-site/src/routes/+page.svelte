<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { ChatWidgetFloating, setWalletProvider } from '@quant-bot/chat-widget'
	import {
		dynamicWalletProvider,
		loginWithDynamic
	} from '$lib/stores/dynamicStore'

	const gatewayUrl = env.PUBLIC_GATEWAY_URL ?? 'http://localhost:3000'
	const apiKey = env.PUBLIC_WIDGET_API_KEY ?? ''

	$effect(() => {
		setWalletProvider($dynamicWalletProvider)
	})
</script>

<div class="page">
	<div class="card">
		<p class="hint">Floating chat widget is active in the bottom-right corner.</p>
	</div>
</div>

<ChatWidgetFloating
	config={{ gatewayUrl, apiKey }}
	callbacks={{ onRequestWalletConnect: () => loginWithDynamic() }}
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

	.hint {
		color: #6b7280;
		font-size: 0.9rem;
		margin: 0;
	}
</style>
