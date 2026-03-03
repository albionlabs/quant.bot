import { useEffect, useRef } from 'react'
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	useWalletDelegation,
	getAuthToken
} from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum'

export interface DynamicEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error' | 'token_refreshed' | 'delegation_complete' | 'delegation_revoked'
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
	triggerRevoke?: boolean
}

const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000
const DELEGATION_OPERATION_TIMEOUT_MS = 90 * 1000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`))
		}, timeoutMs)

		promise
			.then((value) => {
				clearTimeout(timeoutId)
				resolve(value)
			})
			.catch((error) => {
				clearTimeout(timeoutId)
				reject(error)
			})
	})
}

function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	triggerDelegate,
	triggerRevoke
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext()
	const userWallets = useUserWallets()
	const { delegateKeyShares, revokeDelegation, getWalletsDelegatedStatus } = useWalletDelegation()

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

	const getDelegationTarget = () => {
		if (!embeddedWallet) return null
		const chainName = (embeddedWallet.chain?.toUpperCase() === 'ETH' ? 'ETH' : 'EVM') as const
		return {
			chainName,
			walletAddress: embeddedWallet.address,
			target: [{
				chainName,
				accountAddress: embeddedWallet.address
			}]
		}
	}

	const isWalletDelegated = () => {
		const delegationTarget = getDelegationTarget()
		if (!delegationTarget) return false
		return getWalletsDelegatedStatus().some(
			(w) =>
				w.address.toLowerCase() === delegationTarget.walletAddress.toLowerCase() &&
				w.chain === delegationTarget.chainName &&
				w.status === 'delegated'
		)
	}

	// Handle delegation trigger
	const isDelegatingRef = useRef(false)
	useEffect(() => {
		if (triggerDelegate && sdkHasLoaded && user && embeddedWallet && !isDelegatingRef.current) {
			isDelegatingRef.current = true
			const delegationTarget = getDelegationTarget()
			if (!delegationTarget) {
				isDelegatingRef.current = false
				return
			}

			const runDelegation = async () => {
				try {
					await withTimeout(
						delegateKeyShares(delegationTarget.target),
						DELEGATION_OPERATION_TIMEOUT_MS,
						'Delegation'
					)
					if (!isWalletDelegated()) {
						throw new Error('Delegation did not complete. Please retry.')
					}
					onEventRef.current({ type: 'delegation_complete' })
					return
				} catch (error) {
					const message = (error as Error).message || 'Delegation failed'
					const shouldRecover = message.toLowerCase().includes('no eligible wallets to delegate')

					if (shouldRecover) {
						try {
							await withTimeout(
								revokeDelegation(delegationTarget.target),
								DELEGATION_OPERATION_TIMEOUT_MS,
								'Delegation recovery revoke'
							)
							await withTimeout(
								delegateKeyShares(delegationTarget.target),
								DELEGATION_OPERATION_TIMEOUT_MS,
								'Delegation recovery delegate'
							)
							if (!isWalletDelegated()) {
								throw new Error('Delegation recovery did not complete. Please retry.')
							}
							onEventRef.current({ type: 'delegation_complete' })
							return
						} catch (recoveryError) {
							if (isWalletDelegated()) {
								onEventRef.current({ type: 'delegation_complete' })
								return
							}
							onEventRef.current({
								type: 'error',
								payload: {
									error: (recoveryError as Error).message || 'Delegation recovery failed'
								}
							})
							return
						}
					}

					if (isWalletDelegated()) {
						onEventRef.current({ type: 'delegation_complete' })
						return
					}

					onEventRef.current({
						type: 'error',
						payload: { error: message }
					})
				}
			}

			void runDelegation().finally(() => {
				isDelegatingRef.current = false
			})
		}
	}, [triggerDelegate, sdkHasLoaded, user, embeddedWallet, delegateKeyShares, revokeDelegation, getWalletsDelegatedStatus])

	// Handle revoke trigger
	const isRevokingRef = useRef(false)
	useEffect(() => {
		if (triggerRevoke && sdkHasLoaded && user && embeddedWallet && !isRevokingRef.current) {
			isRevokingRef.current = true
			const delegationTarget = getDelegationTarget()
			if (!delegationTarget) {
				isRevokingRef.current = false
				return
			}

			const runRevocation = async () => {
				try {
					if (!isWalletDelegated()) {
						onEventRef.current({ type: 'delegation_revoked' })
						return
					}

					await withTimeout(
						revokeDelegation(delegationTarget.target),
						DELEGATION_OPERATION_TIMEOUT_MS,
						'Revocation'
					)

					if (!isWalletDelegated()) {
						onEventRef.current({ type: 'delegation_revoked' })
						return
					}

					// Retry once because Dynamic SDK swallows connector errors in this hook.
					await withTimeout(
						revokeDelegation(delegationTarget.target),
						DELEGATION_OPERATION_TIMEOUT_MS,
						'Revocation retry'
					)

					if (!isWalletDelegated()) {
						onEventRef.current({ type: 'delegation_revoked' })
						return
					}

					throw new Error('Delegation is still active after revoke attempt')
				} catch (error) {
					if (!isWalletDelegated()) {
						onEventRef.current({ type: 'delegation_revoked' })
						return
					}
					onEventRef.current({
						type: 'error',
						payload: {
							error: (error as Error).message || 'Failed to revoke delegation'
						}
					})
				}
			}

			void runRevocation().finally(() => {
				isRevokingRef.current = false
			})
		}
	}, [triggerRevoke, sdkHasLoaded, user, embeddedWallet, revokeDelegation, getWalletsDelegatedStatus])

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
