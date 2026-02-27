import type { DisplayMessage } from '../types.js';
export interface ChatState {
    messages: DisplayMessage[];
    connected: boolean;
    sessionId: string | null;
    loading: boolean;
}
export declare const chat: import("svelte/store").Writable<ChatState>;
export declare function connect(gatewayUrl: string, token: string): void;
export declare function sendMessage(content: string): void;
export declare function disconnect(): void;
