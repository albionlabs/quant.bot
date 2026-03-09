---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "5.0.0"
---

## Use When
- User asks to list, inspect, compose, or deploy a Raindex strategy.

## Procedure — FOLLOW EXACTLY (no extra calls)

### Step 1: List strategies (if user hasn't specified one)
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/list'
```

### Step 2: Get details (MANDATORY — one call, read the response carefully)
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/details/{strategyKey}'
```
Response shape:
```json
{
  "name": "...",
  "deployments": [{
    "key": "base-inv",
    "fields": {
      "binding-key-1": { "name": "Human Name", "description": "...", "default": "0.5" },
      "binding-key-2": { "name": "Human Name", "description": "..." }
    },
    "selectTokens": {
      "token-key": { "name": "...", "description": "..." }
    },
    "deposits": ["deposit-key-1"]
  }]
}
```

### Step 3: Ask user for values
Present each field from `details.deployments[].fields` — show its `name`, `description`, and `default` if present. Collect user values.
- For `selectTokens`: if the user hasn't specified a token, default to USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). Use the contract address directly — do not look up by symbol.

### Step 4: Deploy (ONE call — do NOT retry with different field names)
Map the details response directly into the deploy payload:
- `deploymentKey` → `deployments[].key`
- `fields` → use the exact `binding-key-*` keys from `deployments[].fields`, with user values
- `selectTokens` → use the exact keys from `deployments[].selectTokens`
- `deposits` → use the exact keys from `deployments[].deposits`

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy-and-stage \
  -H 'Content-Type: application/json' \
  -d '{"strategyKey":"...","deploymentKey":"base-inv","owner":"0x...","fields":{"binding-key-1":"0.5","binding-key-2":"100"},"deposits":{},"selectTokens":{},"executionToken":"<trusted-execution-token>"}'
```
Response includes `deployment.composedRainlang` — use this for the review step.

### Step 5: Review and sign
If `readyToSign=true`:
1. Show the composed Rainlang from `deployment.composedRainlang` in a review tag:
```text
<rainlang-review title="Rainlang Strategy Review">
...composedRainlang from response...
</rainlang-review>
```
2. Wait for user confirmation.
3. After confirmation, output the signing tag and STOP:
```text
<tx-sign id="<signingId>">summary</tx-sign>
```

## CRITICAL: Maximum Call Budget
- Step 1: 1 call. Step 2: 1 call. Step 4: 1 call. Total: **3 calls max** for a deploy flow.
- If deploy fails, report the error to the user. Do NOT retry with guessed field names.
- **NEVER "probe" or "iterate" to discover bindings.** The details response has everything.

## Output (Default)
- If `readyToSign=false`: max 3 bullets with blockers.
- If `readyToSign=true`: show `<rainlang-review>` tag, wait for confirmation, then output `<tx-sign>` tag.

## Never
- Guess, invent, or "probe" for field binding names. Use ONLY the keys from the `details` response.
- Make more than 1 call to `details` per strategy. One call gives you everything.
- Retry deploy with different field names if it fails. Report the error instead.
- Iteratively discover bindings through trial and error. This wastes 5+ minutes. The details response is complete.
- Skip the discovery step. Deploying without calling `details` first will fail.
- Ask user for execution token.
- Output `<tx-sign>` before explicit confirmation.
- Handle post-deployment lookups (widget handles completion).

## Stop
- Stop after concise status, or after single `<tx-sign>` tag.
