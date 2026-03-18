# @albionlabs/chat-widget

Embeddable Svelte 5 chat widget that connects to a quant.bot gateway via WebSocket. Supports wallet-based authentication (SIWE), on-chain transaction signing, and floating or inline layouts.

## Install

```bash
npm install @albionlabs/chat-widget
# or
pnpm add @albionlabs/chat-widget
```

**Peer dependency:** Svelte 5+

## Quick Start (Floating Widget)

The `ChatWidgetFloating` component is the recommended integration. It renders a floating chat bubble in the corner of your page with built-in SIWE authentication, transaction signing, and unread message tracking.

```svelte
<script lang="ts">
  import { ChatWidgetFloating, setWalletProvider, clearWalletProvider } from '@albionlabs/chat-widget'

  // Your wallet connection logic — any EIP-1193 provider works
  let walletProvider = $state(null)

  function connectWallet() {
    // Use your preferred wallet SDK (wagmi, Dynamic, RainbowKit, etc.)
    // Once connected, call setWalletProvider() with the EIP-1193 provider
  }

  $effect(() => {
    if (walletProvider) {
      setWalletProvider(walletProvider)
    } else {
      clearWalletProvider()
    }
  })
</script>

<ChatWidgetFloating
  config={{ gatewayUrl: 'https://your-gateway.example.com', apiKey: 'your-api-key' }}
  callbacks={{ onRequestWalletConnect: connectWallet }}
/>
```

That's it. The widget handles SIWE sign-in, WebSocket connection, and chat UI automatically.

## Configuration

### `FloatingChatWidgetConfig`

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `gatewayUrl` | `string` | Yes | — | Gateway base URL (`https://` or `http://`). Converted to `wss://`/`ws://` internally. |
| `apiKey` | `string` | Yes | — | API key provided by the gateway operator. |
| `position` | `'bottom-right' \| 'bottom-left'` | No | `'bottom-right'` | Corner placement of the floating bubble. |
| `offset` | `{ x: number; y: number }` | No | `{ x: 24, y: 24 }` | Pixel offset from the corner. |
| `startOpen` | `boolean` | No | `false` | Open the chat panel immediately on mount. |
| `theme` | `'light' \| 'dark'` | No | `'dark'` | Widget color theme. |
| `name` | `string` | No | `'quant.bot'` | Display name shown in the header and SIWE sign-in message. |

### `FloatingChatCallbacks`

| Callback | Description |
|----------|-------------|
| `onRequestWalletConnect` | Fired when the user clicks "Connect Wallet" inside the widget. Use this to trigger your wallet SDK's connect flow. |
| `onOpen` | Fired when the chat panel opens. |
| `onClose` | Fired when the chat panel closes. |

## Wallet Provider

The widget accepts any [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) compatible provider. This is the standard interface exposed by MetaMask, wagmi, Dynamic, RainbowKit, and most wallet SDKs.

```typescript
interface WalletProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}
```

The widget uses the following RPC methods through the provider:

| Method | Purpose |
|--------|---------|
| `eth_accounts` | Get the connected wallet address |
| `personal_sign` | Sign the SIWE authentication message |
| `eth_sendTransaction` | Sign and send on-chain transactions (strategy deployments, approvals) |

### Setting the provider

Call `setWalletProvider()` whenever a wallet connects, and `clearWalletProvider()` when it disconnects. The widget detects these changes and manages authentication automatically.

```typescript
import { setWalletProvider, clearWalletProvider } from '@albionlabs/chat-widget'

// After wallet connects:
setWalletProvider(provider)

// After wallet disconnects:
clearWalletProvider()
```

## Authentication Flow

Authentication is handled automatically by `ChatWidgetFloating`:

1. User clicks "Connect Wallet" in the widget header
2. Widget fires `onRequestWalletConnect` — your app triggers its wallet SDK
3. You call `setWalletProvider(provider)` once connected
4. Widget auto-initiates SIWE sign-in (creates message, requests signature via `personal_sign`)
5. Widget posts the signature to the gateway's `/api/auth/login` endpoint
6. On success, the WebSocket connects and the chat is ready

No manual token management is needed.

## Integration Examples

### With wagmi

```svelte
<script lang="ts">
  import { ChatWidgetFloating, setWalletProvider, clearWalletProvider } from '@albionlabs/chat-widget'
  import { connect, disconnect, getConnectorClient, signMessage, sendTransaction, switchChain } from '@wagmi/core'
  import { injected } from '@wagmi/connectors'
  import { wagmiConfig } from './wagmi-config'

  let provider = $state(null)

  async function connectWallet() {
    const result = await connect(wagmiConfig, { connector: injected() })
    const client = await getConnectorClient(wagmiConfig)

    provider = {
      request: async (args) => {
        if (args.method === 'personal_sign' && args.params) {
          const [message] = args.params
          return await signMessage(wagmiConfig, { message })
        }
        if (args.method === 'eth_sendTransaction' && args.params) {
          const [tx] = args.params
          const chainId = tx.chainId ? parseInt(tx.chainId, 16) : undefined
          if (chainId) await switchChain(wagmiConfig, { chainId })
          return await sendTransaction(wagmiConfig, {
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : 0n
          })
        }
        if (args.method === 'eth_accounts') {
          return [client.account.address]
        }
        return client.request({ method: args.method, params: args.params })
      }
    }
    setWalletProvider(provider)
  }

  function disconnectWallet() {
    disconnect(wagmiConfig)
    provider = null
    clearWalletProvider()
  }
</script>

<ChatWidgetFloating
  config={{ gatewayUrl: 'https://your-gateway.example.com', apiKey: 'your-api-key' }}
  callbacks={{ onRequestWalletConnect: connectWallet }}
/>
```

> **Note:** wagmi's `sendTransaction()` handles chain switching properly, unlike using the raw viem client which may throw a `chainId` mismatch error.

### With MetaMask (direct)

```svelte
<script lang="ts">
  import { ChatWidgetFloating, setWalletProvider, clearWalletProvider } from '@albionlabs/chat-widget'

  async function connectWallet() {
    if (!window.ethereum) {
      alert('Please install MetaMask')
      return
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    setWalletProvider(window.ethereum)
  }
</script>

<ChatWidgetFloating
  config={{ gatewayUrl: 'https://your-gateway.example.com', apiKey: 'your-api-key' }}
  callbacks={{ onRequestWalletConnect: connectWallet }}
/>
```

## Inline Widget

For full-page layouts (no floating bubble), use `ChatWidget` directly. You must handle authentication and WebSocket connection yourself.

```svelte
<script lang="ts">
  import { ChatWidget, connect, setAuth } from '@albionlabs/chat-widget'

  // You manage auth externally:
  setAuth({ token: 'jwt-token', address: '0x...' })
  connect({ gatewayUrl: 'wss://your-gateway.example.com', token: 'jwt-token' })
</script>

<div style="height: 600px;">
  <ChatWidget config={{ gatewayUrl: 'wss://your-gateway.example.com', token: 'jwt-token', name: 'my-bot' }} />
</div>
```

## Transaction Signing

When the AI agent deploys a strategy, the widget handles the full signing flow:

1. Agent stages transactions via the gateway
2. Widget displays a signing prompt with transaction details and simulation results
3. User reviews and confirms
4. Widget sends each transaction through the wallet provider via `eth_sendTransaction`
5. Widget reports transaction hashes back to the gateway
6. On completion, the Raindex order link is sent to the chat

No additional code is needed — transaction signing works automatically as long as a wallet provider is set.

## Theming

The widget supports light and dark color themes via the `theme` config property.

```svelte
<!-- Dark theme (default) -->
<ChatWidgetFloating config={{ gatewayUrl, apiKey, theme: 'dark' }} />

<!-- Light theme -->
<ChatWidgetFloating config={{ gatewayUrl, apiKey, theme: 'light' }} />
```

In **dark** mode the floating bubble has a dark background with the white Albion marque. In **light** mode the bubble has a white background with the navy Albion marque. The header stays dark in both themes for brand consistency; the chat body, input, bubbles, modals, and status indicators all adapt.

The inline `ChatWidget` also accepts `theme`:

```svelte
<ChatWidget config={{ gatewayUrl, token, theme: 'light' }} />
```

## Styling

The widget uses its own scoped styles and renders at `z-index: 9999`. If you have elements that need to appear above the widget, use a higher z-index. The widget's internal modals (e.g., Rainlang review) render at `z-index: 10001`.

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `ChatWidgetFloating` | Floating bubble + chat panel with built-in auth. **Recommended.** |
| `ChatWidget` | Inline chat interface. Requires manual auth/connection setup. |
| `WalletStatusIndicator` | Wallet connection status dot + address display. |

### Store Functions

| Function | Description |
|----------|-------------|
| `setWalletProvider(provider)` | Register an EIP-1193 wallet provider. |
| `clearWalletProvider()` | Unregister the wallet provider. |
| `connect(config)` | Manually connect the WebSocket (inline widget only). |
| `disconnect()` | Close the WebSocket connection. |
| `sendMessage(text)` | Send a chat message programmatically. |
| `setAuth({ token, address })` | Set auth state manually (inline widget only). |
| `clearAuth()` | Clear auth state. |

### Stores (Readable)

| Store | Type | Description |
|-------|------|-------------|
| `chat` | `{ messages, status, error }` | Current chat state. |
| `auth` | `{ token, address }` | Current auth state. |
