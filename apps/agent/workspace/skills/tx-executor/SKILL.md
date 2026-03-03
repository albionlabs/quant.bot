---
name: "Transaction Executor"
description: "Execute transactions on Base using delegated wallet signing"
version: "2.0.0"
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
  "delegationId": "uuid-of-active-delegation",
  "userId": "0xuserwalletaddress"
}
```

Parameters:
- `to`: Target contract address (must be valid 0x address)
- `data`: Encoded calldata (hex string starting with 0x)
- `value`: Optional ETH value in wei as string
- `delegationId`: The user's active delegation ID
- `userId`: The authenticated user ID (wallet address, lowercase)

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
2. Before signing/executing strategy transactions, ALWAYS ask: "Do you want to review the Rainlang strategy before signing?"
3. If user says yes, render Rainlang in a modal-compatible block:
```text
<rainlang-review title="Rainlang Strategy Review">
...composed Rainlang...
</rainlang-review>
```
4. ALWAYS ask for explicit user confirmation before executing (after any requested review)
5. Display the simulation results and explain what the transaction will do
6. Never execute a transaction if the simulation fails
