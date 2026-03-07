---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "4.2.0"
---

## Use When
- User asks to list, inspect, compose, or deploy a Raindex strategy.

## Procedure
1. **Discovery (MANDATORY before any deploy)**:
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/list'
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/details/{strategyKey}'
```
   - Field names, deployment keys, and token selectors are **different per strategy**.
   - You MUST call `details` to get the exact field bindings. NEVER guess or assume field names.
2. Build the deploy payload using ONLY the keys returned by `details`.
3. Preferred deploy path:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy-and-stage \
  -H 'Content-Type: application/json' \
  -d '{"strategyKey":"...","deploymentKey":"...","owner":"0x...","fields":{},"deposits":{},"selectTokens":{},"executionToken":"<trusted-execution-token>","metadata":{"composedRainlang":"..."}}'
```
4. Optional compose:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/compose \
  -H 'Content-Type: application/json' \
  -d '{"dotrainSource":"...","deploymentKey":"..."}'
```

## Output (Default)
- Pre-signing: max 5 bullets: strategy, deployment, approval count, simulation status, readiness.
- If `readyToSign=false`: max 3 bullets with blockers.
- If `readyToSign=true` and user confirmed: output only:
```text
<tx-sign id="<signingId>">summary</tx-sign>
```

## Never
- Guess or invent field binding names. Every strategy has unique bindings that MUST come from the `details` response.
- Skip the discovery step. Deploying without calling `details` first will fail.
- Ask user for execution token.
- Output `<tx-sign>` before explicit confirmation.
- Handle post-deployment lookups (widget handles completion).

## Stop
- Stop after concise status, or after single `<tx-sign>` tag.
