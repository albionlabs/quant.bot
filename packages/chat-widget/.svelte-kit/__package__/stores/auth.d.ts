export interface AuthState {
    token: string | null;
    address: string | null;
    userId: string | null;
    authenticated: boolean;
}
export declare const auth: import("svelte/store").Writable<AuthState>;
export declare function setAuth(token: string, address: string, userId: string): void;
export declare function clearAuth(): void;
