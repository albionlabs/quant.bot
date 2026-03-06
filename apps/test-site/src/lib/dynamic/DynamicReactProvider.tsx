import { useEffect, useRef } from 'react'
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	useWalletDelegation,
	getAuthToken
} from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum'
import { waitUntil } from '../async'

export interface DynamicEventData {
	type:
		| 'ready'
		| 'authenticated'
		| 'logout'
		| 'wallet'
		| 'error'
		| 'delegation_complete'
		| 'delegation_revoked'
		| 'delegation_status'
	payload?: {
		userId?: string
		walletAddress?: string
		email?: string
		isAuthenticated?: boolean
		error?: string
		walletType?: 'embedded' | 'external'
		isDelegated?: boolean
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

interface DelegationTarget {
	chainName: 'ETH' | 'EVM'
	walletAddress: string
	target: Array<{
		chainName: 'ETH' | 'EVM'
		accountAddress: string
	}>
}

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

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
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
	triggerLogout,
	triggerDelegate,
	triggerRevoke
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext()
	const userWallets = useUserWallets()
	const {
		delegateKeyShares,
		revokeDelegation,
		getWalletsDelegatedStatus,
		dismissDelegationPrompt
	} = useWalletDelegation()

	const embeddedWallet = userWallets.find((wallet) => wallet.connector?.isEmbeddedWallet)
	const activeWallet = embeddedWallet || primaryWallet

	const wasAuthenticatedRef = useRef(false)
	const hasEmittedReadyRef = useRef(false)
	const lastEmittedWalletRef = useRef<string | null>(null)
	const delegationSampleRef = useRef<{ last: boolean | null; streak: number }>({
		last: null,
		streak: 0
	})

	const onEventRef = useRef(onEvent)
	const onWalletProviderReadyRef = useRef(onWalletProviderReady)

	useEffect(() => { onEventRef.current = onEvent }, [onEvent])
	useEffect(() => { onWalletProviderReadyRef.current = onWalletProviderReady }, [onWalletProviderReady])

	useEffect(() => {
		// Reset delegation sampling whenever auth/wallet context changes.
		delegationSampleRef.current = { last: null, streak: 0 }
	}, [user?.userId, embeddedWallet?.address])

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
							data: typeof txInput.data === 'string' ? txInput.data as `0x${string}` : undefined,
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

	// Handle login trigger
	useEffect(() => {
		if (triggerLogin && sdkHasLoaded && !user) {
			setShowAuthFlow(true)
		}
	}, [triggerLogin, sdkHasLoaded, user, setShowAuthFlow])

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut()
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut])

	const getDelegationTarget = (): DelegationTarget | null => {
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

	const getWalletDelegationState = (): boolean | null => {
		const delegationTarget = getDelegationTarget()
		if (!delegationTarget) return false
		try {
			return getWalletsDelegatedStatus().some(
				(w) =>
					w.address.toLowerCase() === delegationTarget.walletAddress.toLowerCase() &&
					w.chain === delegationTarget.chainName &&
					w.status === 'delegated'
			)
		} catch {
			return null
		}
	}

	const isWalletDelegated = () => getWalletDelegationState() === true

	const getStabilizedWalletDelegationState = (): boolean | null => {
		const raw = getWalletDelegationState()
		if (raw === null) return null

		const sample = delegationSampleRef.current
		if (sample.last === raw) {
			sample.streak += 1
		} else {
			sample.last = raw
			sample.streak = 1
		}

		// Avoid rendering false-positive "delegated" immediately after auth.
		// Require two consecutive true samples.
		if (raw === true && sample.streak < 2) {
			return null
		}

		return raw
	}

	const emitDelegationStatus = () => {
		const delegated = getStabilizedWalletDelegationState()
		onEventRef.current({
			type: 'delegation_status',
			payload: { isDelegated: delegated ?? undefined }
		})
	}

	const emitDelegationComplete = () => {
		emitDelegationStatus()
		onEventRef.current({ type: 'delegation_complete' })
	}

	const emitDelegationRevoked = () => {
		emitDelegationStatus()
		onEventRef.current({ type: 'delegation_revoked' })
	}

	const emitDelegationError = (message: string) => {
		onEventRef.current({
			type: 'error',
			payload: { error: message }
		})
	}

	const waitForWalletDelegationState = async (
		expectedDelegated: boolean,
		timeoutMs = 20_000,
		intervalMs = 1_000
	): Promise<boolean> =>
		waitUntil(() => isWalletDelegated() === expectedDelegated, { timeoutMs, intervalMs })

	const attemptDelegate = async (delegationTarget: DelegationTarget, label: string): Promise<boolean> => {
		await withTimeout(
			delegateKeyShares(delegationTarget.target),
			DELEGATION_OPERATION_TIMEOUT_MS,
			label
		)

		const delegated = await waitForWalletDelegationState(true, 20_000, 1_000)
		return delegated || isWalletDelegated()
	}

	const attemptRevoke = async (delegationTarget: DelegationTarget, label: string): Promise<boolean> => {
		await withTimeout(
			revokeDelegation(delegationTarget.target),
			DELEGATION_OPERATION_TIMEOUT_MS,
			label
		)

		const revoked = await waitForWalletDelegationState(false, 20_000, 1_000)
		return revoked || !isWalletDelegated()
	}

	useEffect(() => {
		if (!sdkHasLoaded) return
		emitDelegationStatus()
		if (!user || !embeddedWallet) return

		const intervalId = setInterval(() => {
			emitDelegationStatus()
		}, 5000)
		return () => clearInterval(intervalId)
	}, [sdkHasLoaded, user, embeddedWallet, getWalletsDelegatedStatus])

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
				let delegated = false
				let lastError: unknown

				try {
					delegated = await attemptDelegate(delegationTarget, 'Delegation')
				} catch (error) {
					lastError = error
				}

				if (!delegated) {
					try {
						// If Dynamic state is stale, force one revoke+delegate recovery cycle.
						await withTimeout(
							revokeDelegation(delegationTarget.target),
							DELEGATION_OPERATION_TIMEOUT_MS,
							'Delegation recovery revoke'
						)
					} catch {
						// Best effort: continue to recovery delegation attempt.
					}

					try {
						delegated = await attemptDelegate(delegationTarget, 'Delegation recovery delegate')
					} catch (error) {
						lastError = error
					}
				}

				if (delegated || isWalletDelegated()) {
					emitDelegationComplete()
					return
				}

				emitDelegationError(errorMessage(lastError, 'Delegation failed'))
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
					// Prevent Dynamic's auto prompt from re-opening delegation immediately after revoke refresh.
					dismissDelegationPrompt()

					if (!isWalletDelegated()) {
						emitDelegationRevoked()
						return
					}

					let revoked = false
					try {
						revoked = await attemptRevoke(delegationTarget, 'Revocation')
					} catch {
						revoked = false
					}

					if (!revoked) {
						revoked = await attemptRevoke(delegationTarget, 'Revocation retry')
					}

					if (!revoked) {
						throw new Error('Delegation is still active after revoke attempt')
					}

					emitDelegationRevoked()
				} catch (error) {
					const revokedAfterError = await waitForWalletDelegationState(false, 15_000, 1_000)
					if (revokedAfterError) {
						emitDelegationRevoked()
						return
					}
					emitDelegationError(errorMessage(error, 'Failed to revoke delegation'))
				}
			}

			void runRevocation().finally(() => {
				isRevokingRef.current = false
			})
		}
	}, [triggerRevoke, sdkHasLoaded, user, embeddedWallet, revokeDelegation, getWalletsDelegatedStatus, dismissDelegationPrompt])

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
