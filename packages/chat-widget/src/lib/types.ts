export interface DisplayMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

export interface ChatWidgetConfig {
	gatewayUrl: string;
	token?: string;
}
