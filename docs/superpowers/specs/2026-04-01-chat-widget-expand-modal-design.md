# Chat Widget Large Screen Mode — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Scope:** `packages/chat-widget`, `apps/albion.dex` (dep bump)

---

## Overview

Add a large-screen expand mode to `ChatWidgetFloating`. An expand button (⛶ icon) appears in the top-right of the floating panel header. Clicking it opens a near-fullscreen modal showing the same chat interface. The modal is closeable via × button, Escape key, or backdrop click. State (WS connection, messages, auth) is fully preserved — no reconnect.

---

## Changes

### `packages/chat-widget/src/lib/ChatWidgetFloating.svelte`

- Add `expanded` using Svelte 5 rune syntax: `let expanded = $state(false)`.
- Add expand button to panel header — rendered only when `isOpen === true && !expanded`.
- **Panel vs modal rendering:** Use `{#if !expanded}` / `{#if expanded}` conditional blocks to render the chat content (MessageList + MessageInput) in either the floating panel OR the modal — never both simultaneously. This avoids duplicate component instances and sidesteps CSS-hiding/animation issues entirely. Both branches read from the same Svelte stores (chat, auth, wallet), so no state is lost on transition and the WS connection is unaffected.
- When `expanded` is true, render a fixed near-fullscreen modal overlay containing:
  - A full-screen backdrop
  - A modal container with header (title + × close button), MessageList, and MessageInput
- When `expanded` is false, render the normal floating panel as today.
- **Backdrop:** `position: fixed; inset: 0; background: var(--cw-backdrop, rgba(0,0,0,0.5))`.
- **Modal container:** `position: fixed; inset: 24px` on large screens; `inset: 8px` on screens ≤ 480px.
- **Z-index:** Backdrop 10002, modal container 10003 (above Rainlang strategy modal at 10001).
- **Click handling:** Modal container calls `event.stopPropagation()` on click to prevent backdrop close.
- **Close triggers:** × button click, backdrop click, Escape keydown.
- **Escape key listener:**
  ```ts
  $effect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') expanded = false; };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });
  ```
  The assignment `expanded = false` works correctly inside a DOM event listener because `expanded` is a `$state` rune — Svelte 5 tracks writes to rune variables regardless of call site.
- No new Svelte stores, no new WebSocket connections.

### `packages/chat-widget/src/lib/version.ts`

- `WIDGET_VERSION`: `'0.2.8'` → `'0.3.0'`.
- Note: `package.json` was at `0.2.9` while `version.ts` was at `0.2.8` — prior out-of-sync error. Both corrected to `0.3.0` in the same commit.

### `packages/chat-widget/package.json`

- `version`: `0.2.9` → `0.3.0`.

### `apps/albion.dex/package.json`

- `@albionlabs/chat-widget`: `^0.2.9` → `^0.3.0`.
- Run `npm install` to update lock file; commit both files.

---

## UI Details

### Expand Button (in floating panel header)
- SVG expand/maximize icon (⛶ style), 16×16px.
- Positioned top-right of the panel header bar.
- Rendered only when `isOpen === true && !expanded`.
- Color: `--cw-text-secondary`; hover → `--cw-text`.

### Modal Layout
```
┌──────────────────────────────────────────────┐  ← backdrop (inset: 0, z-index 10002)
│  ╔════════════════════════════════════════╗  │
│  ║  Albion Assistant            [×]       ║  │  ← modal header
│  ╠════════════════════════════════════════╣  │
│  ║                                        ║  │
│  ║          Message list                  ║  │  ← scrollable
│  ║                                        ║  │
│  ╠════════════════════════════════════════╣  │
│  ║  [message input]              [Send]   ║  │  ← input
│  ╚════════════════════════════════════════╝  │  ← container (inset: 24px, z-index 10003)
└──────────────────────────────────────────────┘
```

### Close Behaviour
| Trigger | Action |
|---------|--------|
| × button click | `expanded = false` |
| Backdrop click | `expanded = false` |
| Escape keydown (when expanded) | `expanded = false` |
| Click anywhere inside modal container | `stopPropagation()` — does NOT close |

### Responsive Behaviour
| Viewport | Modal inset |
|----------|-------------|
| > 480px | `inset: 24px` |
| ≤ 480px | `inset: 8px` |

The expand button remains visible on small screens; users on small screens see a near-fullscreen modal with a tighter margin.

### Z-index Stack
| Layer | Z-index |
|-------|---------|
| FAB button + floating panel | 9999 |
| Rainlang strategy modal (existing) | 10001 |
| Expand modal backdrop | 10002 |
| Expand modal container | 10003 |

---

## Versioning

| File | Before | After | Reason |
|------|--------|-------|--------|
| `version.ts` WIDGET_VERSION | `0.2.8` (out of sync) | `0.3.0` | New feature; `version.ts` (0.2.8) and `package.json` (0.2.9) are currently out of sync — both must be set to `0.3.0` in the same commit, no intermediate step |
| `package.json` version | `0.2.9` (out of sync) | `0.3.0` | See above |
| albion.dex `@albionlabs/chat-widget` | `^0.2.9` | `^0.3.0` | Consume new release |

---

## Not In Scope

- No changes to `ChatWidget.svelte` (embedded mode).
- No changes to WS protocol or gateway.
- No changes to auth or wallet stores.
- No iframe or portal rendering.
- No animation on modal open/close.
