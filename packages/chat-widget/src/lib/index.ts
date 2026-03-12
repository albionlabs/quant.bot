export { default as ChatWidget } from './ChatWidget.svelte';
export { default as ChatWidgetFloating } from './ChatWidgetFloating.svelte';
export { default as ChatBubble } from './components/ChatBubble.svelte';
export { default as MessageList } from './components/MessageList.svelte';
export { default as MessageInput } from './components/MessageInput.svelte';
export { default as WalletStatusIndicator } from './components/WalletStatusIndicator.svelte';
export { chat, connect, disconnect, reconnect, sendMessage } from './stores/chat.js';
export { auth, setAuth, clearAuth } from './stores/auth.js';
export { setWalletProvider, clearWalletProvider } from './stores/wallet.js';
export { WIDGET_VERSION } from './version.js';
export type { Theme } from './theme.js';
export type {
	ChatWidgetConfig,
	DisplayMessage,
	WalletProvider,
	TxSignRequestPayload,
	FloatingChatWidgetConfig,
	FloatingChatCallbacks
} from './types.js';
