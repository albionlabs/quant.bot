---
name: "Transaction Executor"
description: "Execute transactions on Base using delegated wallet signing"
version: "2.0.0"
---

To execute a transaction on Base, use `curl` via the exec tool:

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/execute \
  -H 'Content-Type: application/json' \
  -d '{"to": "0x...", "data": "0x...", "value": "0", "executionToken": "<trusted-execution-token>"}'
```

Parameters:
- `to`: Target contract address (must be valid 0x address)
- `data`: Encoded calldata (hex string starting with 0x)
- `value`: Optional ETH value in wei as string
- `executionToken`: Required short-lived token from trusted gateway context. Never ask the user for this.
- `delegationId`: Optional (ignored by executor path).
- `userId`: Optional legacy field. Do not ask the user for this.

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
