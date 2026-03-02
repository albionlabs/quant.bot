import {
	createDynamicClient,
	sendEmailOTP,
	verifyOTP,
	getWalletAccounts,
	signMessage,
	logout
} from '@dynamic-labs-sdk/client'
import { addWaasEvmExtension } from '@dynamic-labs-sdk/evm/waas'
import {
	delegateWaasKeyShares,
	hasDelegatedAccess,
	revokeWaasDelegation
} from '@dynamic-labs-sdk/client/waas'
import type { DynamicClient, WalletAccount, OTPVerification } from '@dynamic-labs-sdk/client'

let dynamicClient = $state<DynamicClient | null>(null)
let walletAccount = $state<WalletAccount | null>(null)
let address = $state<string | null>(null)

export function getWalletState() {
	return {
		get address() { return address },
		get connected() { return !!walletAccount },
		get walletAccount() { return walletAccount }
	}
}

export function getDynamicClient(): DynamicClient | null {
	return dynamicClient
}

export function initDynamic(environmentId: string) {
	dynamicClient = createDynamicClient({ environmentId })
	addWaasEvmExtension()
}

export async function startEmailLogin(email: string): Promise<OTPVerification> {
	return sendEmailOTP({ email })
}

export async function completeEmailLogin(
	otpVerification: OTPVerification,
	verificationToken: string
) {
	await verifyOTP({ otpVerification, verificationToken })

	const accounts = getWalletAccounts()
	if (accounts.length === 0) {
		throw new Error('No wallet accounts found after login')
	}

	walletAccount = accounts[0]
	address = walletAccount.address
}

export async function signSiweMessage(message: string): Promise<string> {
	if (!walletAccount) throw new Error('No wallet account available')

	const { signature } = await signMessage({ walletAccount, message })
	return signature
}

export async function delegateAccess(): Promise<void> {
	if (!walletAccount) throw new Error('No wallet account available')
	await delegateWaasKeyShares({ walletAccount })
}

export function checkDelegated(): boolean {
	if (!walletAccount) return false
	return hasDelegatedAccess({ walletAccount })
}

export async function revokeDynamic(): Promise<void> {
	if (!walletAccount) throw new Error('No wallet account available')
	await revokeWaasDelegation({ walletAccount })
}

export async function disconnect() {
	await logout()
	dynamicClient = null
	walletAccount = null
	address = null
}
