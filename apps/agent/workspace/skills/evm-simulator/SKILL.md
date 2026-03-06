---
name: "EVM Transaction Simulator"
description: "Simulate EVM transactions on Base before execution"
version: "1.1.0"
---

To simulate an EVM transaction, use `curl` via the exec tool.

IMPORTANT: Always include the `from` field with the user's wallet address. Without it, simulations of transactions that depend on `msg.sender` (e.g. ERC20 approve, ownership checks) will fail.

For raw calldata:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/simulate \
  -H 'Content-Type: application/json' \
  -d '{"from": "0xUSER_ADDRESS", "to": "0x...", "data": "0x...", "value": "0"}'
```

For typed contract calls:
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/simulate \
  -H 'Content-Type: application/json' \
  -d '{"from": "0xUSER_ADDRESS", "to": "0x...", "abi": [...], "functionName": "transfer", "args": ["0xrecipient", "1000000000000000000"], "value": "0"}'
```

Response:
```json
{
  "success": true,
  "returnData": "0x...",
  "gasUsed": "21000",
  "decoded": "result if ABI provided"
}
```

IMPORTANT: Always simulate transactions before executing them. If simulation fails, inform the user and do NOT proceed with execution.
