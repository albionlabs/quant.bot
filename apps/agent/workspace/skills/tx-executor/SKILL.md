---
name: "Transaction Executor"
description: "Execute transactions on Base using delegated session keys"
version: "1.0.0"
---

To execute a transaction on Base, make an HTTP POST request:

URL: http://quant-bot-tools.internal:4000/api/evm/execute
Content-Type: application/json

Body:
```json
{
  "to": "0x1234567890abcdef1234567890abcdef12345678",
  "data": "0xabcdef...",
  "value": "0",
  "sessionKeyId": "sk_abc123",
  "userId": "user_xyz"
}
```

Parameters:
- `to`: Target contract address (must be valid 0x address)
- `data`: Encoded calldata (hex string starting with 0x)
- `value`: Optional ETH value in wei as string
- `sessionKeyId`: The user's active session key ID
- `userId`: The authenticated user ID

Response:
```json
{
  "txHash": "0x...",
  "blockNumber": 12345678,
  "status": "success"
}
```

CRITICAL RULES:
1. ALWAYS simulate the transaction first using the EVM Simulator skill
2. ALWAYS ask for explicit user confirmation before executing
3. Display the simulation results and explain what the transaction will do
4. Never execute a transaction if the simulation fails
