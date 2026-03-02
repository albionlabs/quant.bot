import { writable, derived } from 'svelte/store'

export interface DynamicSession {
	userId: string
	walletAddress: string
	email?: string
	walletType?: 'embedded' | 'external'
}

// State
export const dynamicSession = writable<DynamicSession | null>(null)
export const dynamicLoading = writable<boolean>(true)
export const dynamicError = writable<string | null>(null)
export const dynamicReady = writable<boolean>(false)

// Action triggers (Svelte → React)
export const dynamicTriggerLogin = writable<boolean>(false)
export const dynamicTriggerLogout = writable<boolean>(false)
export const dynamicTriggerDelegate = writable<boolean>(false)

// Delegation state
export const dynamicDelegationComplete = writable<boolean>(false)

// Token management
export const dynamicAccessToken = writable<string | null>(null)

// Wallet provider (set by DynamicSvelteWrapper when React exposes it)
export type WalletProvider = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}
export const dynamicWalletProvider = writable<WalletProvider | null>(null)

// Derived
export const isDynamicAuthenticated = derived(dynamicSession, ($session) => $session !== null)
export const dynamicWalletAddress = derived(
	dynamicSession,
	($session) => $session?.walletAddress ?? null
)

export function loginWithDynamic(): void {
	dynamicLoading.set(true)
	dynamicTriggerLogin.set(true)
	setTimeout(() => dynamicTriggerLogin.set(false), 100)
	setTimeout(() => dynamicLoading.set(false), 2000)
}

export function logoutDynamic(): void {
	dynamicLoading.set(true)
	dynamicTriggerLogout.set(true)
	setTimeout(() => dynamicTriggerLogout.set(false), 100)
}

export function triggerDelegation(): void {
	dynamicDelegationComplete.set(false)
	dynamicTriggerDelegate.set(true)
	setTimeout(() => dynamicTriggerDelegate.set(false), 100)
}
