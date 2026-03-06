import { useEffect, useRef } from 'react'
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	getAuthToken
} from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum'

export interface DynamicEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error'
	payload?: {
		userId?: string
		walletAddress?: string
		email?: string
		isAuthenticated?: boolean
		error?: string
		walletType?: 'embedded' | 'external'
	}
}

interface DynamicBridgeProps {
	environmentId: string
	rpcUrl?: string
	onEvent: (event: DynamicEventData) => void
	onWalletProviderReady?: (
		provider: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
		} | null
	) => void
	triggerLogin?: boolean
	triggerLogout?: boolean
}

function parseChainId(value: unknown): number | undefined {
	if (typeof value !== 'string' || value.trim() === '') return undefined
	try {
		if (value.startsWith('0x')) {
			return Number.parseInt(value, 16)
		}
		return Number.parseInt(value, 10)
	} catch {
		return undefined
	}
}

function parseOptionalWei(value: unknown): bigint | undefined {
	if (typeof value !== 'string' || value.trim() === '') return undefined
	return BigInt(value)
}

function normalizeRpcUrl(value: string | undefined): string | null {
	if (!value) return null
	const trimmed = value.trim()
	if (!trimmed) return null
	return trimmed
}

async function rpcRequest(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
	const response = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: Date.now(),
			method,
			params
		})
	})

	if (!response.ok) {
		throw new Error(`RPC ${method} failed (${response.status})`)
	}

	const payload = await response.json() as { result?: unknown; error?: { message?: string; code?: number } }
	if (payload.error) {
		const message = payload.error.message ?? `RPC error ${payload.error.code ?? 'unknown'}`
		throw new Error(message)
	}
	return payload.result ?? null
}

function enrichSendTxError(error: unknown): Error {
	const message = error instanceof Error ? error.message : 'Failed to submit transaction'
	const lowered = message.toLowerCase()
	if (lowered.includes('mainnet.base.org') || lowered.includes('403')) {
		return new Error(`Transaction submission failed due upstream RPC access (403). ${message}`)
	}
	return new Error(message)
}

function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	rpcUrl
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext()
	const userWallets = useUserWallets()
	const normalizedRpcUrl = normalizeRpcUrl(rpcUrl)

	const embeddedWallet = userWallets.find((wallet) => wallet.connector?.isEmbeddedWallet)
	const activeWallet = embeddedWallet || primaryWallet

	const wasAuthenticatedRef = useRef(false)
	const hasEmittedReadyRef = useRef(false)
	const lastEmittedWalletRef = useRef<string | null>(null)

	const onEventRef = useRef(onEvent)
	const onWalletProviderReadyRef = useRef(onWalletProviderReady)

	useEffect(() => {
		onEventRef.current = onEvent
	}, [onEvent])

	useEffect(() => {
		onWalletProviderReadyRef.current = onWalletProviderReady
	}, [onWalletProviderReady])

	useEffect(() => {
		if (sdkHasLoaded && !hasEmittedReadyRef.current) {
			hasEmittedReadyRef.current = true
			onEventRef.current({ type: 'ready' })
		}
	}, [sdkHasLoaded])

	useEffect(() => {
		if (!sdkHasLoaded) return

		const isAuthenticated = !!user

		if (isAuthenticated && user && activeWallet) {
			wasAuthenticatedRef.current = true
			onEventRef.current({
				type: 'authenticated',
				payload: {
					userId: user.userId,
					walletAddress: activeWallet.address,
					email: user.email,
					isAuthenticated: true,
					walletType: embeddedWallet ? 'embedded' : 'external'
				}
			})
		} else if (!isAuthenticated && wasAuthenticatedRef.current) {
			wasAuthenticatedRef.current = false
			onEventRef.current({
				type: 'logout',
				payload: { isAuthenticated: false }
			})
		}
	}, [sdkHasLoaded, user, activeWallet?.address, embeddedWallet])

	useEffect(() => {
		if (activeWallet?.address && activeWallet.address !== lastEmittedWalletRef.current) {
			lastEmittedWalletRef.current = activeWallet.address
			onEventRef.current({
				type: 'wallet',
				payload: { walletAddress: activeWallet.address }
			})
		}
	}, [activeWallet?.address])

	useEffect(() => {
		if (activeWallet && onWalletProviderReadyRef.current) {
			if (!isEthereumWallet(activeWallet)) {
				onWalletProviderReadyRef.current(null)
				return
			}

			const provider = {
				request: async (args: { method: string; params?: unknown[] }) => {
					if (args.method === 'personal_sign' && args.params) {
						const authToken = getAuthToken()
						if (!authToken) {
							throw new Error('Authentication required. Please log in again.')
						}
						const [message] = args.params as [string, string]
						return await activeWallet.signMessage(message)
					}

					if (args.method === 'eth_sendTransaction') {
						const [txInput] = (args.params ?? []) as [Record<string, unknown>?]
						if (!txInput || typeof txInput !== 'object') {
							throw new Error('eth_sendTransaction requires a transaction object')
						}

						const to = txInput.to
						if (typeof to !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
							throw new Error('Invalid transaction "to" address')
						}

						const from = typeof txInput.from === 'string' ? txInput.from : activeWallet.address
						if (from.toLowerCase() !== activeWallet.address.toLowerCase()) {
							throw new Error('Transaction signer mismatch with active wallet')
						}

						const chainId = parseChainId(txInput.chainId)
						if (chainId !== undefined) {
							await activeWallet.switchNetwork(chainId)
						}

						const walletClient = await activeWallet.getWalletClient(
							chainId !== undefined ? String(chainId) : undefined
						)

						// Prefer signing locally and broadcasting via configured RPC to avoid wallet-internal RPC assumptions.
						if (normalizedRpcUrl) {
							try {
								const signedRawTx = await walletClient.request({
									method: 'eth_signTransaction',
									params: [{
										from,
										to,
										data: typeof txInput.data === 'string' ? txInput.data : undefined,
										value: typeof txInput.value === 'string' ? txInput.value : undefined,
										chainId: chainId !== undefined ? `0x${chainId.toString(16)}` : undefined
									}]
								})
								if (typeof signedRawTx === 'string' && signedRawTx.startsWith('0x')) {
									const txHash = await rpcRequest(normalizedRpcUrl, 'eth_sendRawTransaction', [signedRawTx])
									if (typeof txHash === 'string' && txHash.startsWith('0x')) {
										return txHash
									}
								}
							} catch {
								// If sign+raw-broadcast isn't supported, continue to wallet send path below.
							}
						}

						try {
							const hash = await walletClient.sendTransaction({
								account: activeWallet.address as `0x${string}`,
								to: to as `0x${string}`,
								data: typeof txInput.data === 'string' ? (txInput.data as `0x${string}`) : undefined,
								value: parseOptionalWei(txInput.value)
							})
							return hash
						} catch (error) {
							throw enrichSendTxError(error)
						}
					}

					if (args.method === 'eth_getTransactionReceipt') {
						const [txHash] = (args.params ?? []) as [string?]
						if (typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
							throw new Error('eth_getTransactionReceipt requires a transaction hash')
						}

						if (normalizedRpcUrl) {
							return await rpcRequest(normalizedRpcUrl, 'eth_getTransactionReceipt', [txHash])
						}

						const walletClient = await activeWallet.getWalletClient()
						return await walletClient.request({
							method: 'eth_getTransactionReceipt',
							params: [txHash]
						})
					}

					throw new Error(`Unsupported provider method: ${args.method}`)
				}
			}
			onWalletProviderReadyRef.current(provider)
		} else if (!activeWallet && onWalletProviderReadyRef.current) {
			onWalletProviderReadyRef.current(null)
		}
	}, [activeWallet])

	useEffect(() => {
		if (triggerLogin && sdkHasLoaded && !user) {
			setShowAuthFlow(true)
		}
	}, [triggerLogin, sdkHasLoaded, user, setShowAuthFlow])

	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut()
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut])

	return null
}

export function DynamicReactProvider(props: DynamicBridgeProps) {
	const { environmentId, ...bridgeProps } = props

	if (!environmentId) {
		return null
	}

	return (
		<DynamicContextProvider
			settings={{
				environmentId,
				walletConnectors: [EthereumWalletConnectors],
				logLevel: 'WARN'
			}}
		>
			<DynamicBridge {...bridgeProps} onEvent={props.onEvent} />
		</DynamicContextProvider>
	)
}

export default DynamicReactProvider
