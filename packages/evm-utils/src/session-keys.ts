import type { Address } from '@quant-bot/shared-types';

export interface SessionKeyConfig {
	publicKey: Address;
	userId: string;
	expiresAt: number;
	permissions: string[];
}

const sessionKeys = new Map<string, SessionKeyConfig>();

export function registerSessionKey(id: string, config: SessionKeyConfig): void {
	if (config.expiresAt <= Date.now()) {
		throw new Error('Session key already expired');
	}
	sessionKeys.set(id, config);
}

export function getSessionKey(id: string): SessionKeyConfig | undefined {
	const key = sessionKeys.get(id);
	if (key && key.expiresAt <= Date.now()) {
		sessionKeys.delete(id);
		return undefined;
	}
	return key;
}

export function revokeSessionKey(id: string): boolean {
	return sessionKeys.delete(id);
}

export function isSessionKeyValid(id: string): boolean {
	return getSessionKey(id) !== undefined;
}
