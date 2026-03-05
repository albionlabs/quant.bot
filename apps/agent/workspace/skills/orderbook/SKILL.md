---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "2.0.0"
---

Backend-managed credentials are used automatically by the tools service.
Users should never be asked for API keys.
All requests use `curl` via the exec tool against the internal tools service.
Base URL: http://quant-bot-tools.internal:4000

## Source Of Truth

- Strategy deployment calldata is generated via Raindex MCP (through tools service routes below).
  - Requires tools service MCP env (`RAINDEX_MCP_COMMAND`, `RAINDEX_MCP_ARGS`, and Raindex settings env).


## List Available Strategies

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/list'
```

Returns registry-backed strategy entries from Raindex MCP.
Optional query params: `?registryUrl=<url>&forceRefresh=true`

## Get Strategy Details

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/strategy/details/{strategyKey}'
```

Use this to discover required field names, token selectors, and expected deployment options before constructing deploy input.
Optional query params: `?registryUrl=<url>&forceRefresh=true`

## Deploy Strategy Calldata

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/order/strategy/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "strategyKey": "fixed-limit",
    "deploymentKey": "base",
    "owner": "0x...",
    "fields": { "fixed-io": "0.0005", "max-amount": "1000" },
    "deposits": { "usdc": "1000" },
    "selectTokens": {
      "input-token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "output-token": "0x4200000000000000000000000000000000000006"
    }
  }'
```

Optional fields:
- `registryUrl`: Override registry URL for this call
- `forceRefresh`: Force registry refresh
- `dotrainSource`: If provided, a second MCP call composes the Rainlang for review

Response:
```json
{
  "to": "0xd2938e7c9fe3597f78832ce780feb61945c377d7",
  "data": "0xabcdef...",
  "value": "0",
  "chainId": 8453,
  "approvals": [
    {
      "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "symbol": "USDC",
      "approvalData": "0x095ea7b3..."
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

Use this skill when the user wants to deploy Raindex strategies and generate calldata for signing. Always simulate returned calldata before execution.
