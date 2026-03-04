import { writable, derived, type Writable } from 'svelte/store'

export interface DynamicSession {
	userId: string
	walletAddress: string
	email?: string
	walletType?: 'embedded' | 'external'
}

const TRIGGER_PULSE_MS = 100

function pulseTrigger(trigger: Writable<boolean>, durationMs = TRIGGER_PULSE_MS): void {
	trigger.set(true)
	setTimeout(() => trigger.set(false), durationMs)
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
export const dynamicTriggerRevoke = writable<boolean>(false)

// Delegation state
export const dynamicDelegationComplete = writable<boolean>(false)
export const dynamicRevocationComplete = writable<boolean>(false)
export const dynamicDelegatedStatus = writable<boolean | null>(null)

// Wallet provider (set by DynamicSvelteWrapper when React exposes it)
export type WalletProvider = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}
export const dynamicWalletProvider = writable<WalletProvider | null>(null)

// Derived
export const isDynamicAuthenticated = derived(dynamicSession, ($session) => $session !== null)

export function loginWithDynamic(): void {
	dynamicLoading.set(true)
	pulseTrigger(dynamicTriggerLogin)
	setTimeout(() => dynamicLoading.set(false), 2000)
}

export function logoutDynamic(): void {
	dynamicLoading.set(true)
	pulseTrigger(dynamicTriggerLogout)
}

export function triggerDelegation(): void {
	dynamicDelegationComplete.set(false)
	pulseTrigger(dynamicTriggerDelegate)
}

export function triggerRevocation(): void {
	dynamicRevocationComplete.set(false)
	pulseTrigger(dynamicTriggerRevoke)
}
