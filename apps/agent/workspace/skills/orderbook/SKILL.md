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
- For `deposits`: the details response lists deposit token keys (e.g. `["output"]`). You MUST ask the user how much to deposit. Without a deposit the order is created empty and cannot trade. Map each deposit key to the amount the user wants to deposit (e.g. `{"output": "1.0"}`).

### Step 4: Deploy (ONE call — do NOT retry with different field names)
Map the details response directly into the deploy payload:
- `deploymentKey` → `deployments[].key`
- `fields` → use the exact `binding-key-*` keys from `deployments[].fields`, with user values
- `selectTokens` → use the exact keys from `deployments[].selectTokens`
- `deposits` → use the exact keys from `deployments[].deposits`

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy-and-stage \
  -H 'Content-Type: application/json' \
  -d '{"strategyKey":"...","deploymentKey":"base-inv","owner":"0x...","fields":{"binding-key-1":"0.5","binding-key-2":"100"},"deposits":{"output":"1.0"},"selectTokens":{"output":"0x...","input":"0x..."},"executionToken":"<trusted-execution-token>"}'
```
- `deposits`: keys from `deployments[].deposits`, values are the deposit amounts the user specified. An order with no deposit cannot trade.
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
- Single strategy: Step 1: 1 call. Step 2: 1 call. Step 4: 1 call. Total: **3 calls max**.
- Two strategies: Step 1: 1 call. Step 2: 2 calls. Step 4: 2 calls. Total: **5 calls max**.
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

## Deployment Orientation (`base` vs `base-inv`)
Each strategy has two deployments:
- **`base`** = **sell** reserve tokens, receive payment tokens. `output` = reserve token, `input` = payment token (USDC).
- **`base-inv`** = **buy** reserve tokens, spend payment tokens. `output` = payment token (USDC), `input` = reserve token.

When the user says "buy ALB-WR1-R1":
- Use `base-inv` deployment
- `selectTokens`: `{"output": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "input": "<reserve-token-address>"}`
- `deposits`: the `output` token is USDC, so deposit amount is in USDC

When the user says "sell ALB-WR1-R1":
- Use `base` deployment
- `selectTokens`: `{"output": "<reserve-token-address>", "input": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}`
- `deposits`: the `output` token is the reserve token, so deposit amount is in reserve tokens

## Oil Reserve Strategies
Two strategies are available for oil-backed reserve tokens:

**`oil-token-fair-value-limit`** — Simple limit order at discounted fair value. 6 fields. Best when user wants a straightforward price target.

**`oil-token-fair-value-dca`** — Auction-DCA that gradually sells/buys using a halving auction around the fair value floor. 12 fields (the 6 limit fields + 6 auction parameters). Best for gradual execution with budget controls.

### Shared fields (both strategies)
These 6 fields are identical across both strategies:
- `start-time` — Unix timestamp when reserve decay starts. **Default to "now"**: compute `Math.floor(Date.now() / 1000)` and use that. Only ask the user if they want a future start.
- `end-time` — Unix timestamp when reserve reaches zero. **Ask the user** — this is the expected end-of-life for the reserve asset. There is no sensible default.
- `barrels-of-oil` — Initial reserve in barrels. **Ask the user.**
- `token-supply` — Total supply of the reserve token. **Ask the user.**
- `oracle-price-timeout` — Oracle staleness limit (default: 300 seconds). Use default unless user specifies.
- `required-discount` — Discount fraction, e.g. 0.20 = 20% (default: 0.20). Use default unless user specifies.

### Helping the user with field values
- **`start-time`**: Auto-fill with current unix timestamp. Mention it in the summary ("starts immediately") so the user can override if needed.
- **`end-time`**: Help the user convert a date to unix timestamp. E.g. "December 2030" → compute via `node -e "console.log(Math.floor(new Date('2030-12-31').getTime()/1000))"`.
- **`barrels-of-oil`, `token-supply`**: These are properties of the specific reserve token. Ask the user directly — they know their asset.
- **`amount-per-epoch`** (DCA only): This is the budget per period in the `output` token. Help the user work backwards from their total budget.
- **`time-per-amount-epoch`** and **`time-per-trade-epoch`** (DCA only): These have presets (60s, 3600s, 86400s, etc.). Suggest a reasonable default and explain the tradeoff (shorter = more frequent auctions).

### Deploying both strategies
If the user wants both limit and DCA deployed:
1. Get details for **both** strategy keys (2 calls).
2. Collect field values **once** for the 6 shared fields, then collect the 6 DCA-specific fields.
3. Deploy each strategy separately (2 deploy calls). Total: **4 calls** (2 details + 2 deploys).
4. Each deploy produces its own `<tx-sign>`. Present them sequentially — first deploy, confirm, sign, then second deploy, confirm, sign.

## Stop
- Stop after concise status, or after single `<tx-sign>` tag.
