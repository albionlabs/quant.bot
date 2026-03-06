<script lang="ts">
	import { browser } from '$app/environment'
	import { env } from '$env/dynamic/public'
	import { DynamicReactProvider, type DynamicEventData } from './DynamicReactProvider'
	import {
		dynamicSession,
		dynamicLoading,
		dynamicError,
		dynamicReady,
		dynamicTriggerLogin,
		dynamicTriggerLogout,
		dynamicWalletProvider,
		type DynamicSession
	} from '$lib/stores/dynamicStore'

	let environmentId = $derived(browser ? env.PUBLIC_DYNAMIC_ENVIRONMENT_ID : '')
	const DEFAULT_BASE_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/XPQP0Pta87jBaH6Y1_jKY'
	let baseRpcUrl = $derived(browser ? (env.PUBLIC_BASE_RPC_URL ?? DEFAULT_BASE_RPC_URL) : '')

	$effect(() => {
		if (browser && !environmentId) {
			console.warn('[dynamic] No PUBLIC_DYNAMIC_ENVIRONMENT_ID configured')
			dynamicLoading.set(false)
		}
	})

	function handleWalletProviderReady(
		provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
	) {
		dynamicWalletProvider.set(provider)
	}

	function handleDynamicEvent(event: DynamicEventData) {
		switch (event.type) {
			case 'ready':
				dynamicReady.set(true)
				dynamicLoading.set(false)
				break

			case 'authenticated':
				if (event.payload) {
					const session: DynamicSession = {
						userId: event.payload.userId || '',
						walletAddress: event.payload.walletAddress || '',
						email: event.payload.email,
						walletType: event.payload.walletType
					}
					dynamicSession.set(session)
					dynamicError.set(null)
				}
				dynamicLoading.set(false)
				break

			case 'logout':
				dynamicSession.set(null)
				dynamicLoading.set(false)
				break

			case 'wallet':
				if (event.payload?.walletAddress) {
					dynamicSession.update((s) =>
						s ? { ...s, walletAddress: event.payload!.walletAddress! } : null
					)
				}
				break

			case 'error':
				dynamicError.set(event.payload?.error || 'Unknown error')
				dynamicLoading.set(false)
				break
		}
	}
</script>

{#if browser && environmentId}
	<react.DynamicReactProvider
		{environmentId}
		rpcUrl={baseRpcUrl || undefined}
		onEvent={handleDynamicEvent}
		onWalletProviderReady={handleWalletProviderReady}
		triggerLogin={$dynamicTriggerLogin}
		triggerLogout={$dynamicTriggerLogout}
	></react.DynamicReactProvider>
{/if}
