# TODO: Agentic Order-Deploy Flow Hardening

Date: 2026-03-04
Scope: Agent -> tools -> signing/execution

## Completed

- [x] Enforce execution auth binding — old `/api/evm/execute` and `/api/evm/request-signature` removed. Signing flow uses staged signing with `executionToken` validated via `resolveUserIdFromExecutionToken()`.
- [x] Enforce Dynamic webhook signature verification (fail closed) — HMAC-SHA256 with `timingSafeEqual`, returns 401 if missing/invalid.
- [x] Improve simulation fidelity with sender context — `from` address in `EvmSimulateRequest`, used in `simulateContract`/`estimateGas`/`call`.
- [x] Add approval orchestration before deploy — approval detection, spender parsing, `requires_prior_state` status, approvals staged before deploy tx.
- [x] Add explicit timeouts for upstream calls — delegation client (10s), signing proxy (15s), Raindex MCP (30s), token registry (10s), GraphQL (15s).
- [x] Gateway-owned signing endpoints — `GET /api/signing/:id` and `POST /api/signing/:id/complete` with auth + ownership validation.
- [x] Keep tools APIs internal — gateway proxies signing. Agent calls tools directly only on internal network.
- [x] Keep token logging/metrics parallel-only — gateway logs + internal metrics, never model-mediated.

## Remaining: Remove `[trusted-context]` Prompt Injection

The execution token and userId are still injected into the LLM prompt as a `[trusted-context]` block in `apps/gateway/src/routes/chat.ts`. This is the single remaining hardening item.

### TODO
- [ ] Move execution identity binding to server-side only (gateway-proxied staging or out-of-band header injection).
- [ ] Update agent skills to remove `executionToken` references from curl examples.
- [ ] Add regression test ensuring prompts sent via `chat.send` do not contain `[trusted-context]`.

### Design Options
1. **Gateway-proxied staging** — agent calls gateway (which has the authenticated session), gateway forwards to tools with server-side identity.
2. **Out-of-band header injection** — agent runtime injects token as an HTTP header rather than prompt text.

### Acceptance Criteria
- [ ] No `[trusted-context ...]` block in chat message forwarding.
- [ ] Deploy/signing works end-to-end for authenticated users.
