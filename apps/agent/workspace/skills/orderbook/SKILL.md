---
name: "Orderbook"
description: "Deploy Raindex orderbook strategies via MCP-backed tooling"
version: "2.0.0"
---

Backend-managed credentials are used automatically by the tools service.
Users should never be asked for API keys.
Base URL: http://quant-bot-tools.internal:4000

## Source Of Truth

- Strategy deployment calldata is generated via Raindex MCP (through tools service routes below).
  - Requires tools service MCP env (`RAINDEX_MCP_COMMAND`, `RAINDEX_MCP_ARGS`, and Raindex settings env).


## List Available Strategies

GET /api/strategy/list?registryUrl=<optional>&forceRefresh=<optional>

Returns registry-backed strategy entries from Raindex MCP.

## Get Strategy Details

GET /api/strategy/details/{strategyKey}?registryUrl=<optional>&forceRefresh=<optional>

Use this to discover required field names, token selectors, and expected deployment options before constructing deploy input.

## Deploy Strategy Calldata

POST /api/order/strategy/deploy
Content-Type: application/json

Body:
```json
{
  "strategyKey": "fixed-limit",
  "deploymentKey": "base",
  "owner": "0x1234567890abcdef1234567890abcdef12345678",
  "fields": {
    "fixed-io": "0.0005",
    "max-amount": "1000"
  },
  "deposits": {
    "usdc": "1000"
  },
  "selectTokens": {
    "input-token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "output-token": "0x4200000000000000000000000000000000000006"
  }
}
```

Optional fields:
- `registryUrl`: Override registry URL for this call
- `forceRefresh`: Force registry refresh
- `dotrainSource`: If provided, composed Rainlang is returned for review

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

POST /api/order/strategy/compose
Content-Type: application/json

Body:
```json
{
  "dotrainSource": "version: 4\n...",
  "deploymentKey": "base"
}
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
