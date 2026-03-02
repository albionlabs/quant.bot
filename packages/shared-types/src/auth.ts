export interface User {
	id: string;
	address: string;
	createdAt: number;
}

export interface SessionKey {
	id: string;
	userId: string;
	publicKey: string;
	expiresAt: number;
}

export type DelegationStatus = 'active' | 'revoked' | 'expired'

export interface Delegation {
	id: string;
	userId: string;
	walletId: string;
	walletAddress: string;
	status: DelegationStatus;
	chainId: number;
	createdAt: number;
	expiresAt: number;
}

export interface DelegationActivateRequest {
	delegationId: string;
	walletAddress: string;
}

export interface DelegationActivateResponse {
	activeDelegationId: string;
}

export interface DelegationStatusResponse {
	active: boolean;
	delegationId?: string;
	walletAddress?: string;
	expiresAt?: number;
}

export interface AuthToken {
	token: string;
	expiresAt: number;
}

export interface LoginRequest {
	signature: string;
	message: string;
	address: string;
}

export interface LoginResponse {
	token: string;
	user: User;
}

export interface RefreshResponse {
	token: string;
}

export interface SessionKeyRequest {
	publicKey: string;
}

export interface SessionKeyResponse {
	expiresAt: number;
}
