---
name: "Swap"
description: "Get swap quotes and calldata for Raindex orderbook swaps"
version: "1.0.0"
---

All requests require HTTP Basic Auth with API key credentials.
Base URL: http://albion.internal:8000

## Get Swap Quote

POST /v1/swap/quote
Content-Type: application/json

Body:
```json
{
  "inputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "outputToken": "0x4200000000000000000000000000000000000006",
  "outputAmount": "0.5"
}
```

Parameters:
- `inputToken`: Address of the token you are selling
- `outputToken`: Address of the token you are buying
- `outputAmount`: Desired amount of output token (human-readable)

Response:
```json
{
  "inputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "outputToken": "0x4200000000000000000000000000000000000006",
  "outputAmount": "0.5",
  "estimatedOutput": "0.5",
  "estimatedInput": "1250.75",
  "estimatedIoRatio": "2501.5"
}
```

## Get Swap Calldata

POST /v1/swap/calldata
Content-Type: application/json

Body:
```json
{
  "taker": "0x1234567890abcdef1234567890abcdef12345678",
  "inputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "outputToken": "0x4200000000000000000000000000000000000006",
  "outputAmount": "0.5",
  "maximumIoRatio": "2600"
}
```

Parameters:
- `taker`: Address executing the swap
- `inputToken` / `outputToken`: Token pair addresses
- `outputAmount`: Desired output amount (human-readable)
- `maximumIoRatio`: Maximum acceptable IO ratio (slippage protection)

Response:
```json
{
  "to": "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
  "data": "0xabcdef...",
  "value": "0x0",
  "estimatedInput": "1250.75",
  "approvals": [
    {
      "token": "0x...",
      "spender": "0x...",
      "amount": "1250750000",
      "symbol": "USDC",
      "approvalData": "0x..."
    }
  ]
}
```

Use this skill when the user wants to swap tokens on the Raindex orderbook. First get a quote to show the estimated price, then get calldata when ready to execute. Always simulate the returned calldata before submitting.
