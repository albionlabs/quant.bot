---
name: "Transaction Executor"
description: "Stage pre-built transactions for client-side batch signing on Base. Use when transactions are already constructed (with to/data/value) and need to be bundled and staged for the user to sign. Do NOT use for strategy deployments — use the Orderbook skill instead, which handles its own staging."
---

## Call
Bundle all transactions in one request:

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/stage-signing \
  -H 'Content-Type: application/json' \
  -d '{
    "executionToken": "<trusted-execution-token>",
    "transactions": [
      { "label": "Approve USDC", "to": "0x...", "data": "0x...", "value": "0", "symbol": "USDC" },
      { "label": "Deploy Strategy", "to": "0x...", "data": "0x..." }
    ],
    "metadata": {
      "operationType": "strategy_deployment",
      "strategyKey": "fixed-limit",
      "composedRainlang": "..."
    }
  }'
```

## Endpoint Behavior
- Simulates all transactions server-side.
- Returns:
```json
{ "signingId": "uuid", "summary": "...", "simulations": [...], "readyToSign": true, "allSimulationsSucceeded": true }
```

## Output (Default)
If `readyToSign` is true, output a single tag:
```text
<tx-sign id="<signingId>">summary text here</tx-sign>
```
If `readyToSign` is false, return max 3 bullets with blockers.

## Never
- Ask user for `executionToken`.
- Output `<tx-sign>` before explicit confirmation.
- Manually simulate transactions already staged.

## Stop
- Stop after readiness summary, or after single `<tx-sign>` tag.
