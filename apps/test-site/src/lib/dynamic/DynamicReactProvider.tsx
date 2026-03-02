import React, { useEffect, useRef } from 'react'
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	useWalletDelegation,
	getAuthToken
} from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum'

export interface DynamicEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error' | 'token_refreshed' | 'delegation_complete'
	payload?: {
		userId?: string
		walletAddress?: string
		email?: string
		isAuthenticated?: boolean
		error?: string
		walletType?: 'embedded' | 'external'
		accessToken?: string
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
	triggerDelegate?: boolean
}

const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000

function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	triggerDelegate
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext()
	const userWallets = useUserWallets()
	const { delegateKeyShares } = useWalletDelegation()

	const embeddedWallet = userWallets.find((wallet) => wallet.connector?.isEmbeddedWallet)
	const activeWallet = embeddedWallet || primaryWallet

	const wasAuthenticatedRef = useRef(false)
	const hasEmittedReadyRef = useRef(false)
	const lastEmittedWalletRef = useRef<string | null>(null)

	const onEventRef = useRef(onEvent)
	const onWalletProviderReadyRef = useRef(onWalletProviderReady)

	useEffect(() => { onEventRef.current = onEvent }, [onEvent])
	useEffect(() => { onWalletProviderReadyRef.current = onWalletProviderReady }, [onWalletProviderReady])

	// Notify ready
	useEffect(() => {
		if (sdkHasLoaded && !hasEmittedReadyRef.current) {
			hasEmittedReadyRef.current = true
			onEventRef.current({ type: 'ready' })
		}
	}, [sdkHasLoaded])

	// Notify auth changes
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

	// Notify wallet changes
	useEffect(() => {
		if (activeWallet?.address && activeWallet.address !== lastEmittedWalletRef.current) {
			lastEmittedWalletRef.current = activeWallet.address
			onEventRef.current({
				type: 'wallet',
				payload: { walletAddress: activeWallet.address }
			})
		}
	}, [activeWallet?.address])

	// Expose wallet provider
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
					return null
				}
			}
			onWalletProviderReadyRef.current(provider)
		} else if (!activeWallet && onWalletProviderReadyRef.current) {
			onWalletProviderReadyRef.current(null)
		}
	}, [activeWallet])

	// Handle login trigger
	useEffect(() => {
		if (triggerLogin && sdkHasLoaded && !user) {
			setShowAuthFlow(true)
		}
	}, [triggerLogin, sdkHasLoaded, user, setShowAuthFlow])

	// Token refresh
	useEffect(() => {
		if (!sdkHasLoaded || !user) return

		const emitToken = () => {
			const token = getAuthToken()
			if (token) {
				onEventRef.current({
					type: 'token_refreshed',
					payload: { accessToken: token }
				})
			}
		}

		emitToken()
		const intervalId = setInterval(emitToken, TOKEN_REFRESH_INTERVAL)
		return () => clearInterval(intervalId)
	}, [sdkHasLoaded, user])

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut()
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut])

	// Handle delegation trigger
	const isDelegatingRef = useRef(false)
	useEffect(() => {
		if (triggerDelegate && sdkHasLoaded && user && embeddedWallet && !isDelegatingRef.current) {
			isDelegatingRef.current = true
			delegateKeyShares()
				.then(() => {
					onEventRef.current({ type: 'delegation_complete' })
				})
				.catch((error) => {
					onEventRef.current({
						type: 'error',
						payload: { error: (error as Error).message || 'Delegation failed' }
					})
				})
				.finally(() => {
					isDelegatingRef.current = false
				})
		}
	}, [triggerDelegate, sdkHasLoaded, user, embeddedWallet, delegateKeyShares])

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
