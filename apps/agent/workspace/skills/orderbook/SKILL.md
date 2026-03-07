---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "4.0.0"
---

Use backend tools to compose deployment calldata, then stage all transactions for batch signing.
All requests use `curl` via the exec tool against `http://quant-bot-tools.internal:4000`.

## List Available Strategies

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/list'
```

Returns `[{ key, name, description }]`. Optional: `?registryUrl=<url>&forceRefresh=true`

## Get Strategy Details

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/details/{strategyKey}'
```

Returns deployment keys, field bindings (name, description, default), token selectors, and deposit keys. **Always call before deploying.** Optional: `?registryUrl=<url>&forceRefresh=true`

## Deploying a Strategy

1. Call `/api/strategy/details/{strategyKey}` to discover deployments, fields, token selectors, and deposit keys.
2. Use the returned keys exactly as field bindings, select-token keys, and deposit keys in the deploy request.
3. All field values and deposit amounts are **human-readable strings** (e.g. `"0.0005"`, `"1000"`). The SDK handles decimal conversion.

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "strategyKey": "fixed-limit",
    "deploymentKey": "base",
    "owner": "0xUSER_ADDRESS",
    "fields": { "fixed-io": "0.0005" },
    "deposits": { "token2": "1000" },
    "selectTokens": {
      "token1": "0x4200000000000000000000000000000000000006",
      "token2": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  }'
```

Optional fields: `registryUrl`, `forceRefresh`, `dotrainSource` (triggers Rainlang composition for review).

Returns `{ to, data, value, chainId, approvals: [{ token, symbol, approvalData }], composedRainlang? }`.

## Staging for Signing

After getting calldata from `/api/order/strategy/deploy`:

1. Build the `transactions` array:
   - For each approval: `{ "label": "Approve {symbol}", "to": "{token}", "data": "{approvalData}", "symbol": "{symbol}" }`
   - Main deploy tx: `{ "label": "Deploy Strategy", "to": "{to}", "data": "{data}", "value": "{value}" }`

2. Call stage-signing with all transactions in one request:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/stage-signing \
  -H 'Content-Type: application/json' \
  -d '{
    "executionToken": "<trusted-execution-token>",
    "transactions": [...],
    "metadata": {
      "operationType": "strategy_deployment",
      "strategyKey": "fixed-limit",
      "composedRainlang": "..."
    }
  }'
```

3. If `allSimulationsSucceeded`, output a single tag:
```text
<tx-sign id="<signingId>">summary</tx-sign>
```

The widget handles sequential signing, confirmations, order hash resolution, and Raindex link display automatically.

## Compose Rainlang (Optional)

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/compose \
  -H 'Content-Type: application/json' \
  -d '{"dotrainSource": "version: 4\n...", "deploymentKey": "base"}'
```

Returns `{ rainlang }`.

## Execution Safety

- Pass `composedRainlang` in the stage-signing metadata — the widget renders a review modal before signing.
- Do NOT output `<tx-sign>` tag if any simulation fails.
- ALWAYS ask for explicit user confirmation before outputting the tag.
- Do NOT handle post-deployment lookups — the widget completion endpoint does this.
