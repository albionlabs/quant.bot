---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "3.0.0"
---

Use backend tools to compose/simulate deployment calldata, then request client signature for execution.
Users should never be asked for API keys or raw execution tokens.
All requests use `curl` via the exec tool against the internal tools service.
Base URL: http://quant-bot-tools.internal:4000

## List Available Strategies

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/list'
```

Returns registry-backed strategy entries with keys like `fixed-limit`, `auction-dca`, `grid`, etc.
Optional query params: `?registryUrl=<url>&forceRefresh=true`

## Get Strategy Details

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/details/{strategyKey}'
```

Returns the full schema for a strategy including deployment keys, field bindings (with names, descriptions, defaults, and presets), token selectors, and deposit keys. **Always call this before deploying** to discover the exact parameter keys for any strategy.
Optional query params: `?registryUrl=<url>&forceRefresh=true`

## Deploying a Strategy

1. Call `/api/strategy/details/{strategyKey}` to discover deployments, fields, token selectors, and deposit keys.
2. Use the returned keys exactly as field bindings, select-token keys, and deposit keys in the deploy request.
3. All field values and deposit amounts are **human-readable strings** (e.g. `"0.0005"`, `"1000"`, `"0.2"`). The SDK handles decimal conversion internally.

Example (fixed-limit: buy WETH with USDC at 0.0005 WETH/USDC, depositing 1000 USDC):
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

## Deploy Strategy Calldata

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "strategyKey": "<strategy-key>",
    "deploymentKey": "<deployment-key>",
    "owner": "0x...",
    "fields": { ... },
    "deposits": { ... },
    "selectTokens": { ... }
  }'
```

Optional fields:
- `registryUrl`: Override registry URL for this call
- `forceRefresh`: Force registry refresh
- `dotrainSource`: If provided, a second MCP call composes the Rainlang for review

Response:
```json
{
  "to": "0xOrderbookAddress",
  "data": "0xDeploymentCalldata...",
  "value": "0",
  "chainId": 8453,
  "approvals": [
    {
      "token": "0xTokenAddress",
      "symbol": "USDC",
      "approvalData": "0xApprovalCalldata..."
    }
  ],
  "composedRainlang": "#calculate-io\n..."
}
```

## Compose Rainlang (Optional)

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/compose \
  -H 'Content-Type: application/json' \
  -d '{"dotrainSource": "version: 4\n...", "deploymentKey": "base"}'
```

Response:
```json
{
  "rainlang": "#calculate-io\n..."
}
```

## Execution Safety

Before proceeding to signing/execution for any strategy transaction:
- Ask: `Do you want to review the Rainlang strategy before signing?`
- If yes, present the composed Rainlang in a modal-compatible block:
```text
<rainlang-review title="Rainlang Strategy Review">
...composed Rainlang...
</rainlang-review>
```
- Then ask for explicit execute confirmation.

Use this skill when the user wants to deploy Raindex strategies and generate calldata for signing. Always simulate returned calldata before requesting signature.
