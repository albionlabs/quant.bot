---
name: "Orderbook"
description: "Deploy, cancel, and query Raindex orderbook orders"
version: "1.0.0"
---

Backend-managed credentials are used automatically by the tools service.
Users should never be asked for API keys.
Base URL: http://quant-bot-tools.internal:4000

## Deploy DCA Order

POST /api/order/dca
Content-Type: application/json

Body:
```json
{
  "inputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "outputToken": "0x4200000000000000000000000000000000000006",
  "budgetAmount": "1000000",
  "period": 4,
  "periodUnit": "hours",
  "startIo": "0.0005",
  "floorIo": "0.0003",
  "inputVaultId": null,
  "outputVaultId": null
}
```

Parameters:
- `inputToken`: ERC-20 token address to spend
- `outputToken`: ERC-20 token address to receive
- `budgetAmount`: Total amount to spend (in token decimals)
- `period`: Number of time units between purchases
- `periodUnit`: `"days"`, `"hours"`, or `"minutes"`
- `startIo`: Starting IO ratio (output per input)
- `floorIo`: Minimum IO ratio (price floor)
- `inputVaultId` / `outputVaultId`: Optional vault IDs (auto-generated if null)

Response returns `{ to, data, value, approvals }` — a transaction to sign and submit.

## Deploy Solver Order

POST /api/order/solver
Content-Type: application/json

Body:
```json
{
  "inputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "outputToken": "0x4200000000000000000000000000000000000006",
  "amount": "1000000",
  "ioRatio": "0.0005",
  "inputVaultId": null,
  "outputVaultId": null
}
```

Parameters:
- `inputToken` / `outputToken`: Token pair addresses
- `amount`: Order size in input token decimals
- `ioRatio`: Fixed IO ratio for the order
- `inputVaultId` / `outputVaultId`: Optional vault IDs

Response returns `{ to, data, value, approvals }`.

## Deploy Custom Strategy (Dotrain/Rainlang)

POST /api/order/custom
Content-Type: application/json

Body:
```json
{
  "dotrain": "version: 1\n...\n---\n#calculate-io\n_: 0;\n#handle-io\n_: 0;",
  "deploymentKey": "some-deployment",
  "owner": "0x1234567890abcdef1234567890abcdef12345678",
  "additionalSettings": [],
  "selectTokens": {
    "input-token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "output-token": "0x4200000000000000000000000000000000000006"
  },
  "fieldValues": {
    "fixed-io": "1850",
    "amount-per-trade": "250"
  },
  "deposits": {
    "usdc": "5000"
  }
}
```

Response returns `{ to, data, value, chainId, approvals, composedRainlang, emitMetaCall }`.
Use this when the user wants a strategy not covered by the fixed DCA/solver request shapes.

Before proceeding to signing/execution for any strategy transaction:
- Ask: `Do you want to review the Rainlang strategy before signing?`
- If yes, present the composed Rainlang in a modal-compatible block:
```text
<rainlang-review title="Rainlang Strategy Review">
...composed Rainlang...
</rainlang-review>
```
- Then ask for explicit execute confirmation.

## Get Order Detail

GET /api/order/{order_hash}

Returns full order details including owner, token pair, vault balances, IO ratio, and trade history.

## Cancel Order

POST /api/order/cancel
Content-Type: application/json

Body:
```json
{
  "orderHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"
}
```

Response returns `{ transactions, summary }` with withdrawal transactions and a summary of tokens returned.

## Query Orders by Owner

GET /api/orders/address/{address}?page=1&pageSize=20

Returns a paginated list of orders owned by the given address.

## Query Orders by Transaction

GET /api/orders/tx/{tx_hash}

Returns all orders created in a given transaction.

Use this skill when the user wants to deploy, manage, or query Raindex orderbook orders. Always simulate the returned transaction calldata before execution.
