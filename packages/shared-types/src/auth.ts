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
