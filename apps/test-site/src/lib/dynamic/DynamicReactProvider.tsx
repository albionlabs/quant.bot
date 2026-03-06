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

function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext()
	const userWallets = useUserWallets()

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
						const hash = await walletClient.sendTransaction({
							account: activeWallet.address as `0x${string}`,
							to: to as `0x${string}`,
							data: typeof txInput.data === 'string' ? (txInput.data as `0x${string}`) : undefined,
							value: parseOptionalWei(txInput.value)
						})
						return hash
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
