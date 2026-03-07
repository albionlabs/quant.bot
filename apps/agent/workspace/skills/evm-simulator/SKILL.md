---
name: "EVM Transaction Simulator"
description: "Simulate EVM transactions on Base before execution"
version: "1.3.0"
---

IMPORTANT: Always include `from` with the user's wallet address — simulations depending on `msg.sender` will fail without it.

For raw calldata:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/simulate \
  -H 'Content-Type: application/json' \
  -d '{"from": "0xUSER_ADDRESS", "to": "0x...", "data": "0x...", "value": "0"}'
```

For typed contract calls, add `abi`, `functionName`, and `args` fields.

Returns `{ success, returnData, gasUsed, decoded? }`.

Always simulate before executing. If simulation fails, do NOT proceed with execution.

Report concisely: success/failure, gas used, decoded return data if present.
