# quant.bot

Monorepo for the quant.bot trading assistant — gateway server, AI agent, tools service, and embeddable chat widget.

## Project Structure

- `apps/gateway` — Fastify HTTP/WS server (auth, chat relay, signing)
- `apps/agent` — OpenClaw AI agent
- `apps/tools` — Fastify tool service (token data, orderbook, NPV)
- `apps/test-site` — SvelteKit test harness for the chat widget
- `packages/chat-widget` — Svelte 5 embeddable widget, published as `@albionlabs/chat-widget`
- `packages/shared-types` — Internal TypeScript types (not published)
- `packages/evm-utils` — EVM utilities (CBOR, address helpers)

## Code Style

- Node 22+, ESM throughout
- Tabs, single quotes, no trailing commas
- TypeScript 5.9, Svelte 5, Fastify 5

## Build & Test

```sh
pnpm turbo build          # build all
pnpm turbo test:run       # test all
pnpm turbo build --filter=@albionlabs/chat-widget  # build single package
```

## Versioning

### Chat Widget (`@albionlabs/chat-widget`)

The widget is published to npm and consumed by third-party sites. It communicates with the gateway over WebSocket.

**Version location**: `packages/chat-widget/src/lib/version.ts` (`WIDGET_VERSION`) and `packages/chat-widget/package.json`.

- **Patch** (0.1.x): Bug fixes, style changes, internal refactors — no protocol changes
- **Minor** (0.x.0): New features, new message types, additive protocol changes — backwards compatible
- **Major** (x.0.0): Breaking changes to the WS protocol, removed/renamed message fields, changed auth flow — requires gateway update

**Both `WIDGET_VERSION` and `package.json` version must be kept in sync.** Update both in the same commit.

### Gateway (`apps/gateway`)

**Version location**: `apps/gateway/src/version.ts`

- `UI_VERSION` — the gateway's own version, sent to the widget on connect
- `MIN_WIDGET_VERSION` — the minimum widget version the gateway accepts

**When to bump `MIN_WIDGET_VERSION`**: When the gateway makes a breaking change that old widgets can't handle (removed message fields, changed auth flow, new required query params). Bump it to the widget version that first supports the new protocol.

### Version Negotiation Protocol

1. Widget sends `widgetVersion` query param on WS connect
2. Gateway compares against `MIN_WIDGET_VERSION`
3. If widget is too old → gateway sends `WIDGET_OUTDATED` error with `minVersion` field and closes the socket
4. Widget receives `WIDGET_OUTDATED` → stops reconnecting, displays the error to the user

### Breaking Change Checklist

When making a breaking change between widget and gateway:

1. Implement the change in both `packages/chat-widget` and `apps/gateway`
2. Bump widget `WIDGET_VERSION` and `package.json` version (major bump)
3. Bump `MIN_WIDGET_VERSION` in `apps/gateway/src/version.ts` to match
4. Bump `UI_VERSION` in gateway
5. Update `gateway-types.ts` in the widget AND `shared-types/src/chat.ts` if message shapes changed
6. Test both old and new widget versions against the gateway to verify the error message works

## Publishing

The chat widget publishes to npm automatically via GitHub Actions when:
- Files in `packages/chat-widget/` change on `main`
- The version in `package.json` doesn't already exist on npm

To release: bump version in `package.json` and `version.ts`, commit, push to `main`.

## Commit Rules

- Bump `UI_VERSION` in `apps/gateway/src/version.ts` with every gateway commit (patch for fixes, minor for features)
