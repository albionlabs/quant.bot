# Debug Status: Delegation + Ceremony Timeouts (2026-03-06)

## Scope
This document summarizes where we are after simplifying delegation state handling and tracing execute ceremony failures in production logs.

## Current Classification Against The 4 Failure Modes
1. **Ceremony starts then stalls mid-flight**: **Confirmed**.
2. **Ceremony never starts due to stale/wrong credential**: **Not the dominant failure in latest runs**.
3. **WebSocket/relay path cut near ~60s**: **Confirmed repeatedly**.
4. **Persistence/decryption mismatch beyond pubkey serialization fix**: **No evidence in latest runs**.

## Key Evidence (UTC)
- `20:07:03` request `req-6` reached `/api/evm/execute` and started signing attempt `a3d2fe30`.
- `20:07:14` to `20:08:04` showed `CALL_IN_FLIGHT` every 10s, then phase entered `relay_cutoff_window` at ~60s.
- `20:08:05` failed with:
  - `WebSocket protocol error: Connection reset without closing handshake`
  - `failureClass: possible_relay_or_websocket_cut_near_60s`
  - endpoint returned `500` in ~61.9s.
- Retries `req-7`, `req-9`, and `req-a` reproduced the same pattern (start, progress, fail near 61–62s with same websocket reset).

## Delegation/Credential State During Failures
- Delegation webhook state was active and stored (`wallet.delegation.created`).
- Credential retrieval on each execute attempt was healthy:
  - consistent `walletId: 416478b3-22fe-46b9-bd26-ff51af512078`
  - stable key-share length (`1066`)
  - successful `POST_LOAD` in delegation service and `FETCH_OK` in tools.
- No `credentials invalid/missing` paths were hit in these failing runs.

## Additional Finding
Earlier deploy flow had one separate issue:
- `raindex_compose_rainlang` was called with `dotrain_source: true` (boolean), which MCP rejects (`expected string`).
- This is independent of the 60s ceremony websocket reset but caused misleading deploy errors.

## Changes Made In This Branch
### 1) Clear stale delegation UI error state
- `apps/test-site/src/lib/dynamic/DynamicSvelteWrapper.svelte`
  - Clear `dynamicError` on `delegation_complete`, `delegation_revoked`, and delegated `delegation_status`.
- `apps/test-site/src/routes/+page.svelte`
  - Clear page/UI errors once backend reports active delegation.

### 2) Harden deploy route against invalid `dotrainSource`
- `apps/tools/src/routes/raindex-strategy.ts`
  - Validate `dotrainSource` as non-empty string when provided.
  - Return `400` validation error instead of letting MCP fail with `502` on boolean input.
- `apps/tools/src/services/raindex-strategy.ts`
  - Guard compose step with explicit string/trim check.

### 3) Improve execute-path observability for “never started” cases
- `apps/tools/src/routes/tx-execute.ts`
  - Add reject-reason logs for early validation exits:
    - `invalid_to`
    - `invalid_data`
    - `missing_execution_token`
    - `invalid_execution_token`

## Validation Performed
- `pnpm --filter @quant-bot/tools check` passed.
- `pnpm --filter @quant-bot/tools test:run -- raindex-strategy` passed.
- `pnpm --filter @quant-bot/test-site build` passed (with pre-existing dependency warnings).

## Practical Interpretation
At this point, the dominant execution failure is not delegation persistence/decryption. It is a repeatable websocket/relay reset around ~60 seconds during Dynamic delegated signing ceremonies.

## Suggested Next Focus
1. Correlate Dynamic relay endpoint/session handling with these attempt timestamps.
2. Test from a second runtime/region to rule out local Fly network path effects.
3. Add SDK-level websocket lifecycle hooks/logging if available (open/close codes, retry policy, endpoint URL fingerprint).
4. Decide whether to add retry/backoff around ceremony initiation or fail-fast UX messaging specifically for `possible_relay_or_websocket_cut_near_60s`.
