---
name: "Transaction Executor"
description: "Stage transactions for client-side batch signing on Base"
version: "4.0.0"
---

To stage transactions for client signing on Base, bundle all transactions in a single call:

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

Parameters:
- `executionToken` (from gateway context, never ask the user)
- `transactions[]`: each has `label` (human-readable), `to`, `data`, `value?`, `symbol?`
- `metadata?`: optional context (`operationType`, `strategyKey`, `composedRainlang`)

The endpoint **simulates all transactions server-side** and returns:
```json
{ "signingId": "uuid", "summary": "2 transactions staged: [1] Approve USDC (ok, ~52k gas) [2] Deploy Strategy (ok, ~340k gas)", "simulations": [...], "allSimulationsSucceeded": true }
```

## Output Format

If `allSimulationsSucceeded` is true, output a single tag:
```text
<tx-sign id="<signingId>">summary text here</tx-sign>
```

The widget handles fetching the full bundle, sequential signing, confirmation, and post-deployment lookups automatically.

CRITICAL RULES:
1. Do NOT output `<tx-sign>` tag if any simulation fails — explain the failure instead
2. ALWAYS ask for explicit user confirmation before outputting the signing tag
3. Display the simulation summary and explain what the transactions will do
4. Do NOT manually simulate — the stage-signing endpoint does this automatically
5. Do NOT handle post-deployment order hash lookups — the widget does this via the completion endpoint
6. Pass `composedRainlang` in metadata — the widget renders the review modal before signing
