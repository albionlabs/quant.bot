export interface ChatMessage {
	id: string;
	sessionId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

export interface ChatSession {
	id: string;
	userId: string;
	createdAt: number;
	lastMessageAt: number;
}

export interface ClientMessage {
	type: 'message';
	content: string;
	sessionId?: string;
}

export interface ServerMessage {
	type: 'message' | 'tool_call' | 'tool_result' | 'stream' | 'error';
	sessionId: string;
	role?: 'assistant';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	result?: unknown;
	delta?: string;
	code?: string;
	message?: string;
}
