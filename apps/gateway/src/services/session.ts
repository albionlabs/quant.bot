import { randomUUID } from 'node:crypto';
import type { ChatSession } from '@quant-bot/shared-types';

const sessions = new Map<string, ChatSession>();

export function createSession(userId: string): ChatSession {
	const now = Date.now();
	const session: ChatSession = {
		id: randomUUID(),
		userId,
		createdAt: now,
		lastMessageAt: now
	};
	sessions.set(session.id, session);
	return session;
}

export function getSession(sessionId: string): ChatSession | undefined {
	return sessions.get(sessionId);
}

export function touchSession(sessionId: string): void {
	const session = sessions.get(sessionId);
	if (session) {
		session.lastMessageAt = Date.now();
	}
}
