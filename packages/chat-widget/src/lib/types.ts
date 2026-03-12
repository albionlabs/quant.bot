export interface DisplayMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

export interface WalletProvider {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface TxSignRequestPayload {
	kind: 'evm_send_transaction';
	chainId: number;
	from: string;
	to: string;
	data: string;
	value: string;
	summary?: {
		to?: string;
		valueWei?: string;
		dataBytes?: number;
	};
}

export interface ChatWidgetConfig {
	gatewayUrl: string;
	token?: string;
	theme?: 'light' | 'dark';
}

export interface FloatingChatWidgetConfig {
	gatewayUrl: string;
	apiKey: string;
	position?: 'bottom-right' | 'bottom-left';
	offset?: { x: number; y: number };
	startOpen?: boolean;
	theme?: 'light' | 'dark';
}

export interface FloatingChatCallbacks {
	onRequestWalletConnect?: () => void;
	onOpen?: () => void;
	onClose?: () => void;
}
