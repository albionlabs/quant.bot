---
name: "Orderbook"
description: "Deploy, cancel, and query Raindex orderbook orders"
version: "1.0.0"
---

Backend-managed credentials are used automatically by the tools service.
Users should never be asked for API keys.
Base URL: http://quant-bot-tools.internal:4000

Error interpretation:
- `/api/order/*` endpoints are implemented on the tools service.
- If a call returns an error payload with `source: "orderbook-api"` (especially 404/500), that came from the upstream orderbook API, not from a missing tools route.
- For upstream failures, report the returned `upstreamPath` and message exactly.
- Current production caveat: `/api/order/dca` and `/api/order/solver` may return a known upstream runtime failure.
  - If so, do not retry those endpoints.
  - Switch to `/api/order/custom` flow immediately.

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
If this route returns upstream runtime-unavailable errors, switch to `/api/order/custom`.

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
If this route returns upstream runtime-unavailable errors, switch to `/api/order/custom`.

## Deploy Custom Strategy (Dotrain/Rainlang)

POST /api/order/custom
Content-Type: application/json

`deploymentKey` must match a key present in BOTH `gui.deployments` and top-level `deployments`.

Minimal dotrain skeleton (working shape):
```yaml
version: 4
networks:
  base:
    rpcs:
      - https://mainnet.base.org
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: https://example.com/subgraph
orderbooks:
  base:
    address: 0xd2938e7c9fe3597f78832ce780feb61945c377d7
    network: base
    subgraph: base
    deployment-block: 0
deployers:
  base:
    address: 0xC1A14cE2fd58A3A2f99deCb8eDd866204eE07f8D
    network: base
tokens:
  usdc:
    network: base
    address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    decimals: 6
    label: USD Coin
    symbol: USDC
  weth:
    network: base
    address: 0x4200000000000000000000000000000000000006
    decimals: 18
    label: Wrapped Ether
    symbol: WETH
orders:
  my-order:
    deployer: base
    orderbook: base
    inputs:
      - token: usdc
        vault-id: 1
    outputs:
      - token: weth
        vault-id: 1
scenarios:
  my-scenario:
    deployer: base
    bindings: {}
deployments:
  my-deployment:
    order: my-order
    scenario: my-scenario
gui:
  name: Minimal custom order
  description: Minimal deployable dotrain for /api/order/custom
  deployments:
    my-deployment:
      name: Minimal deployment
      description: Minimal deployment
      deposits:
        - token: usdc
          presets:
            - "0"
      fields: []
---
#calculate-io
_ _: 0 0;
#handle-io
:;
#handle-add-order
:;
```

Request shape:
```json
{
  "dotrain": "<the YAML above as a single string>",
  "deploymentKey": "my-deployment",
  "owner": "0x1234567890abcdef1234567890abcdef12345678",
  "additionalSettings": [],
  "fieldValues": {},
  "deposits": {
    "usdc": "1"
  }
}
```

Response returns `{ to, data, value, chainId, approvals, composedRainlang, emitMetaCall }`.
Use this when the user wants a strategy not covered by the fixed DCA/solver request shapes.
Use this as the primary deploy path whenever DCA/Solver legacy routes are unavailable.

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
