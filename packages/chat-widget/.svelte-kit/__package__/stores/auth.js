import { writable } from 'svelte/store';
const initial = {
    token: null,
    address: null,
    userId: null,
    authenticated: false
};
export const auth = writable(initial);
export function setAuth(token, address, userId) {
    auth.set({ token, address, userId, authenticated: true });
}
export function clearAuth() {
    auth.set(initial);
}
