import { writable } from 'svelte/store';

export interface AuthState {
	token: string | null;
	address: string | null;
	userId: string | null;
	authenticated: boolean;
}

const initial: AuthState = {
	token: null,
	address: null,
	userId: null,
	authenticated: false
};

export const auth = writable<AuthState>(initial);

export function setAuth(token: string, address: string, userId: string) {
	auth.set({ token, address, userId, authenticated: true });
}

export function clearAuth() {
	auth.set(initial);
}
