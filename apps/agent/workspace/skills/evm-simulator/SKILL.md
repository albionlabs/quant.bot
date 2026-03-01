---
name: "EVM Transaction Simulator"
description: "Simulate EVM transactions on Base before execution"
version: "1.0.0"
---

To simulate an EVM transaction, make an HTTP POST request:

URL: http://quant-bot-tools.internal:4000/api/evm/simulate
Content-Type: application/json

For raw calldata:
```json
{
  "to": "0x1234567890abcdef1234567890abcdef12345678",
  "data": "0xabcdef...",
  "value": "0"
}
```

For typed contract calls:
```json
{
  "to": "0x1234567890abcdef1234567890abcdef12345678",
  "abi": [{ "type": "function", "name": "transfer", ... }],
  "functionName": "transfer",
  "args": ["0xrecipient", "1000000000000000000"],
  "value": "0"
}
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
