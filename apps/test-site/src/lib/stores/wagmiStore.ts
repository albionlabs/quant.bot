import { writable } from 'svelte/store'
import { connect, disconnect, getConnectorClient } from '@wagmi/core'
import { injected } from '@wagmi/connectors'
import { wagmiConfig } from '$lib/wagmi/config.js'
import type { WalletProvider } from './dynamicStore.js'

export const wagmiWalletProvider = writable<WalletProvider | null>(null)
export const wagmiAddress = writable<string | null>(null)
export const wagmiConnecting = writable<boolean>(false)
export const wagmiError = writable<string | null>(null)

export async function connectWithWagmi(): Promise<void> {
	wagmiConnecting.set(true)
	wagmiError.set(null)

	try {
		const result = await connect(wagmiConfig, { connector: injected() })
		const address = result.accounts[0]
		wagmiAddress.set(address ?? null)

		const client = await getConnectorClient(wagmiConfig)
		const provider: WalletProvider = {
			request: async (args: { method: string; params?: unknown[] }) => {
				if (args.method === 'personal_sign' && args.params) {
					const [message] = args.params as [string, string]
					return await client.signMessage({ message })
				}

				if (args.method === 'eth_accounts') {
					return [client.account.address]
				}

				return client.request({
					method: args.method as never,
					params: args.params as never
				})
			}
		}

		wagmiWalletProvider.set(provider)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to connect'
		wagmiError.set(message)
		wagmiWalletProvider.set(null)
		wagmiAddress.set(null)
	} finally {
		wagmiConnecting.set(false)
	}
}

export async function disconnectWagmi(): Promise<void> {
	try {
		await disconnect(wagmiConfig)
	} catch {
		// ignore
	}
	wagmiWalletProvider.set(null)
	wagmiAddress.set(null)
}
