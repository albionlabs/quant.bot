# Chat Widget Large-Screen Expand Modal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand button to the ChatWidgetFloating panel header that opens a near-fullscreen modal, closeable via ×, Escape, or backdrop click — sharing all existing stores so no reconnect occurs.

**Architecture:** Add `expanded = $state(false)` to `ChatWidgetFloating`. Wrap the `.chat-panel` element in `{#if !expanded}` so it unmounts when the modal is open (stores keep all state). Extract panel body into a Svelte 5 `{#snippet}` to avoid duplication — render the same snippet in both the panel and the modal. The modal is rendered as a sibling to `.floating-container`, outside its stacking context.

**Tech Stack:** Svelte 5 (`$state`, `$effect`, `{#snippet}`, `{@render}`), plain scoped CSS, pnpm workspaces.

---

## Chunk 1: expand state + button + escape handler

### Task 1: Add `expanded` state and Escape key effect

**Files:**
- Modify: `packages/chat-widget/src/lib/ChatWidgetFloating.svelte` (script block, lines 30–35)

- [ ] **Step 1.1: Add `expanded` state variable after the existing state declarations (after line 35)**

  In the `<script>` block, after `let siweDismissed = $state(false);`, add:

  ```ts
  let expanded = $state(false);
  ```

- [ ] **Step 1.2: Add the Escape key `$effect` after the existing effects (after line 80)**

  ```ts
  // Close expanded modal on Escape
  $effect(() => {
  	if (!expanded) return;
  	const handler = (e: KeyboardEvent) => {
  		if (e.key === 'Escape') expanded = false;
  	};
  	document.addEventListener('keydown', handler);
  	return () => document.removeEventListener('keydown', handler);
  });
  ```

  This effect re-runs whenever `expanded` changes. When `expanded` is false, it returns immediately (no listener). When `expanded` is true, it attaches the listener and returns a cleanup function that removes it. Svelte 5 calls the cleanup when the condition becomes false or the component is destroyed.

- [ ] **Step 1.3: Verify TypeScript compiles**

  ```bash
  cd /Users/alastairong/Albion/quant.bot
  pnpm turbo build --filter=@albionlabs/chat-widget
  ```

  Expected: build succeeds, no TypeScript errors.

---

### Task 2: Add expand button to panel header

**Files:**
- Modify: `packages/chat-widget/src/lib/ChatWidgetFloating.svelte` (template, around line 173; style block)

- [ ] **Step 2.1: Add expand button in the panel header, just before the close button (line ~173)**

  Current close button:
  ```svelte
  <button class="close-btn" onclick={toggle} aria-label="Close chat">
  ```

  Insert this block immediately before it:
  ```svelte
  {#if isOpen && !expanded}
  	<button
  		class="expand-btn"
  		onclick={() => {
  			unreadCount = 0;
  			lastSeenMessageCount = get(chat).messages.length;
  			expanded = true;
  		}}
  		aria-label="Expand chat to full screen"
  	>
  		<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
  			<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  		</svg>
  	</button>
  {/if}
  ```

  The `{#if isOpen && !expanded}` guard means the expand button is only shown when the panel is open and not already expanded.

  The `onclick` resets the unread count (same as `toggle()` does when opening) and then sets `expanded = true`.

- [ ] **Step 2.2: Add `.expand-btn` CSS in the `<style>` block, right after `.close-btn:hover`**

  ```css
  .expand-btn {
  	display: flex;
  	align-items: center;
  	justify-content: center;
  	width: 1.5rem;
  	height: 1.5rem;
  	border: none;
  	border-radius: 0.25rem;
  	background: transparent;
  	color: #9ca3af;
  	cursor: pointer;
  	flex-shrink: 0;
  }

  .expand-btn:hover {
  	color: white;
  	background: rgba(255, 255, 255, 0.1);
  }
  ```

- [ ] **Step 2.3: Build and check for errors**

  ```bash
  pnpm turbo build --filter=@albionlabs/chat-widget
  ```

  Expected: succeeds.

---

## Chunk 2: modal overlay

### Task 3: Extract panel body to snippet and add modal

> **Note:** `let expanded = $state(false)` and the Escape key `$effect` are added in Task 1 (Chunk 1). This task only touches the template and CSS.

**Files:**
- Modify: `packages/chat-widget/src/lib/ChatWidgetFloating.svelte` (template, lines 155–209 + new modal; style block)

- [ ] **Step 3.1: Wrap `.chat-panel` in `{#if !expanded}`**

  Currently line 155:
  ```svelte
  <!-- Chat Panel -->
  <div class="chat-panel" class:open={isOpen}>
  ```

  Change to:
  ```svelte
  <!-- Chat Panel (hidden while expanded modal is open) -->
  {#if !expanded}
  	<div class="chat-panel" class:open={isOpen}>
  ```

  And close the `{#if}` after the closing `</div>` of `.chat-panel` (currently line ~209):
  ```svelte
  	</div>
  {/if}
  ```

  When the modal closes (`expanded = false`) and `isOpen` is still true, the panel remounts with `class:open` already applied — it snaps back visible with no entry animation. This is intentional (spec: "No animation on modal open/close"). The existing open/close CSS transition for the FAB toggle is unaffected.

  The full updated panel block (replace lines 154–209):
  ```svelte
  <!-- Chat Panel (hidden while expanded modal is open) -->
  {#if !expanded}
  	<div class="chat-panel" class:open={isOpen}>
  		<div class="panel-header">
  			<div class="panel-brand">
  				<AlbionMark size={18} variant="light" />
  				<span class="panel-title">{name}</span>
  			</div>
  			<WalletStatusIndicator onRequestWalletConnect={callbacks.onRequestWalletConnect} />
  			{#if $chat.reconnecting}
  				<span class="status-dot reconnecting"></span>
  			{:else if $auth.authenticated}
  				<span class="status-dot" class:connected={$chat.connected}></span>
  				{#if !$chat.connected}
  					<button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
  				{/if}
  			{/if}
  			{#if $chat.connected && $chat.backendVersion}
  				<span class="version-label">v {$chat.backendVersion}</span>
  			{/if}
  			{#if isOpen && !expanded}
  				<button
  					class="expand-btn"
  					onclick={() => {
  						unreadCount = 0;
  						lastSeenMessageCount = get(chat).messages.length;
  						expanded = true;
  					}}
  					aria-label="Expand chat to full screen"
  				>
  					<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
  						<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  					</svg>
  				</button>
  			{/if}
  			<button class="close-btn" onclick={toggle} aria-label="Close chat">
  				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  					<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  				</svg>
  			</button>
  		</div>

  		<div class="panel-body">
  			{@render panelBody()}
  		</div>
  	</div>
  {/if}
  ```

- [ ] **Step 3.2: Add the `{#snippet panelBody()}` block**

  In Svelte 5, snippets are defined in the template (not the script). Add this block immediately before the `<!-- Chat Panel -->` comment (i.e., before the `{#if !expanded}` block you just added):

  ```svelte
  {#snippet panelBody()}
  	{#if !$walletProvider && !$auth.authenticated}
  		<div class="auth-prompt">
  			<p>Connect your wallet to sign in</p>
  			<button class="connect-wallet-btn" onclick={() => callbacks.onRequestWalletConnect?.()}>
  				Connect Wallet
  			</button>
  		</div>
  	{:else if signingIn}
  		<div class="auth-prompt">
  			<p>Signing in...</p>
  			<div class="spinner"></div>
  		</div>
  	{:else if siweError}
  		<div class="auth-prompt">
  			<p class="error-text">{siweError}</p>
  			<button class="connect-wallet-btn" onclick={handleSiweLogin}>
  				Retry Sign In
  			</button>
  		</div>
  	{:else if $auth.authenticated}
  		<ChatWidget config={chatConfig} hideHeader={true} />
  	{:else}
  		<div class="auth-prompt">
  			<p>Preparing sign-in...</p>
  			<div class="spinner"></div>
  		</div>
  	{/if}
  {/snippet}
  ```

  Then replace the old `<div class="panel-body">` content in the panel:
  ```svelte
  <div class="panel-body">
  	{@render panelBody()}
  </div>
  ```
  (You already did this in Step 3.1.)

- [ ] **Step 3.3: Add the modal — rendered as a sibling OUTSIDE `.floating-container`**

  After the closing `</div>` of `.floating-container` (currently around line 224), add.

  **Note on `.version-label` layout:** The existing `.version-label { margin-left: auto }` CSS rule is reused as the flex spacer in the modal header — it pushes the close button to the far right. No additional CSS is needed in `.expand-modal-header` for this to work correctly, since the flex row structure mirrors the panel header exactly.

  ```svelte
  {#if expanded}
  	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  	<div
  		class="expand-backdrop"
  		style={themeStyle}
  		onclick={() => (expanded = false)}
  		aria-hidden="true"
  	>
  		<div
  			class="expand-modal"
  			onclick={(e) => e.stopPropagation()}
  			role="dialog"
  			aria-modal="true"
  			aria-label="{name} — expanded"
  		>
  			<div class="expand-modal-header">
  				<div class="panel-brand">
  					<AlbionMark size={18} variant="light" />
  					<span class="panel-title">{name}</span>
  				</div>
  				<WalletStatusIndicator onRequestWalletConnect={callbacks.onRequestWalletConnect} />
  				{#if $chat.reconnecting}
  					<span class="status-dot reconnecting"></span>
  				{:else if $auth.authenticated}
  					<span class="status-dot" class:connected={$chat.connected}></span>
  					{#if !$chat.connected}
  						<button class="reconnect-btn" onclick={reconnect}>Reconnect</button>
  					{/if}
  				{/if}
  				{#if $chat.connected && $chat.backendVersion}
  					<span class="version-label">v {$chat.backendVersion}</span>
  				{/if}
  				<button class="close-btn" onclick={() => (expanded = false)} aria-label="Close expanded chat">
  					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  						<path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  					</svg>
  				</button>
  			</div>
  			<div class="expand-modal-body">
  				{@render panelBody()}
  			</div>
  		</div>
  	</div>
  {/if}
  ```

- [ ] **Step 3.4: Add CSS for the modal in the `<style>` block (append at the end)**

  ```css
  .expand-backdrop {
  	position: fixed;
  	inset: 0;
  	background: var(--cw-backdrop, rgba(0, 0, 0, 0.5));
  	z-index: 10002;
  	display: flex;
  	align-items: stretch;
  	justify-content: stretch;
  }

  .expand-modal {
  	/* position: absolute (not fixed) — backdrop is already fixed + inset:0,
  	   so absolute inset:24px is visually equivalent to fixed inset:24px but
  	   avoids a fixed-in-fixed stacking context that breaks if backdrop ever
  	   gets a transform or will-change applied */
  	position: absolute;
  	inset: 24px;
  	z-index: 10003;
  	background: var(--cw-bg);
  	border: 1px solid var(--cw-border);
  	border-radius: 0.75rem;
  	box-shadow: var(--cw-shadow);
  	display: flex;
  	flex-direction: column;
  	overflow: hidden;
  }

  .expand-modal-header {
  	display: flex;
  	align-items: center;
  	gap: 0.5rem;
  	padding: 0.6rem 0.75rem;
  	background: var(--cw-header-bg);
  	color: white;
  	flex-shrink: 0;
  }

  .expand-modal-body {
  	flex: 1;
  	overflow: hidden;
  	display: flex;
  	flex-direction: column;
  }

  @media (max-width: 480px) {
  	.expand-modal {
  		inset: 8px;
  	}
  }
  ```

- [ ] **Step 3.5: Build**

  ```bash
  pnpm turbo build --filter=@albionlabs/chat-widget
  ```

  Expected: succeeds with no errors.

- [ ] **Step 3.6: Commit Chunk 2**

  ```bash
  cd /Users/alastairong/Albion/quant.bot
  git add packages/chat-widget/src/lib/ChatWidgetFloating.svelte
  git commit -m "feat(chat-widget): add expand button and fullscreen modal to floating widget"
  ```

---

## Chunk 3: version bumps + release

### Task 4: Bump widget version to 0.3.0

**Files:**
- Modify: `packages/chat-widget/src/lib/version.ts`
- Modify: `packages/chat-widget/package.json`

`version.ts` is currently `0.2.8` and `package.json` is `0.2.9` — they are out of sync. Both must be set to `0.3.0` in the same commit. No intermediate step.

- [ ] **Step 4.1: Update `version.ts`**

  File: `packages/chat-widget/src/lib/version.ts`

  Change:
  ```ts
  export const WIDGET_VERSION = '0.2.8';
  ```
  To:
  ```ts
  export const WIDGET_VERSION = '0.3.0';
  ```

- [ ] **Step 4.2: Update `package.json`**

  File: `packages/chat-widget/package.json`

  Change `"version": "0.2.9"` to `"version": "0.3.0"`.

- [ ] **Step 4.3: Build to confirm version is embedded correctly**

  ```bash
  pnpm turbo build --filter=@albionlabs/chat-widget
  ```

  Expected: succeeds.

- [ ] **Step 4.4: Commit both version files together**

  ```bash
  cd /Users/alastairong/Albion/quant.bot
  git add packages/chat-widget/src/lib/version.ts packages/chat-widget/package.json
  git commit -m "chore(chat-widget): bump version to 0.3.0"
  ```

---

### Task 5: Push to main to trigger npm publish

- [ ] **Step 5.1: Push to main**

  ```bash
  cd /Users/alastairong/Albion/quant.bot
  git push origin main
  ```

  The GitHub Actions workflow publishes `@albionlabs/chat-widget` when `packages/chat-widget/**` changes on `main` and the version doesn't already exist on npm. After pushing, CI will build and publish `0.3.0`.

- [ ] **Step 5.2: Confirm publish (optional — wait ~2 min then check)**

  ```bash
  npm view @albionlabs/chat-widget version
  ```

  Expected: `0.3.0`

---

### Task 6: Bump `@albionlabs/chat-widget` in albion.dex

**Files:**
- Modify: `/Users/alastairong/Albion/albion.dex/package.json`
- Modify: `/Users/alastairong/Albion/albion.dex/package-lock.json` (via npm install)

- [ ] **Step 6.1: Update the dependency in `package.json`**

  In `/Users/alastairong/Albion/albion.dex/package.json`, change:
  ```json
  "@albionlabs/chat-widget": "^0.2.9"
  ```
  to:
  ```json
  "@albionlabs/chat-widget": "^0.3.0"
  ```

- [ ] **Step 6.2: Install to update lock file**

  ```bash
  cd /Users/alastairong/Albion/albion.dex
  npm install
  ```

  Expected: `package-lock.json` updated, `@albionlabs/chat-widget@0.3.0` resolved.

  If npm can't find `0.3.0` yet (CI hasn't published), wait a couple of minutes and retry.

- [ ] **Step 6.3: Commit both files**

  ```bash
  cd /Users/alastairong/Albion/albion.dex
  git add package.json package-lock.json
  git commit -m "chore: bump @albionlabs/chat-widget to 0.3.0"
  git push origin main
  ```

---

## Verification

After all tasks are done, verify manually in the test-site:

```bash
cd /Users/alastairong/Albion/quant.bot
pnpm turbo dev --filter=apps/test-site
```

Checklist:
- [ ] Floating FAB opens the panel normally
- [ ] Panel header shows the expand icon (⛶) to the left of the × button
- [ ] Clicking expand opens the near-fullscreen modal (panel disappears)
- [ ] Modal header shows widget name, status, and × close button
- [ ] Clicking × in modal header closes modal, panel snaps back
- [ ] Clicking backdrop closes modal
- [ ] Pressing Escape closes modal
- [ ] Clicking inside modal content does NOT close it
- [ ] After closing modal, chat history is intact (same messages visible in panel)
- [ ] On narrow viewport (< 480px): modal uses `inset: 8px` (tight margins)
- [ ] Expand button not visible when panel is closed (FAB-only state)
