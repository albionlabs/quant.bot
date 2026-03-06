---
name: "Transaction Executor"
description: "Prepare client-side transaction signature requests on Base"
version: "3.0.0"
---

To request a client signature on Base, use `curl` via the exec tool:

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/request-signature \
  -H 'Content-Type: application/json' \
  -d '{"to": "0x...", "data": "0x...", "value": "0", "executionToken": "<trusted-execution-token>"}'
```

Parameters:
- `to`: Target contract address (must be valid 0x address)
- `data`: Encoded calldata (hex string starting with 0x)
- `value`: Optional ETH value in wei as string
- `executionToken`: Required short-lived token from trusted gateway context. Never ask the user for this.

Response:
```json
{
  "kind": "evm_send_transaction",
  "chainId": 8453,
  "from": "0x...",
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "summary": {
    "to": "0x...",
    "valueWei": "0",
    "dataBytes": 123
  }
}
```

When returning the final assistant response that asks user to sign, always include this hidden machine-readable block exactly once:

```text
<tx-sign-request>{"kind":"evm_send_transaction",...}</tx-sign-request>
```

Rules for the tag:
- Must be valid JSON copied from the tool response.
- Do not alter `to`, `data`, `value`, `chainId`, or `from`.
- Keep human-facing explanation outside the tag.

CRITICAL RULES:
1. ALWAYS simulate the transaction first using the EVM Simulator skill
2. Before signing/executing strategy transactions, ALWAYS ask: "Do you want to review the Rainlang strategy before signing?"
3. If user says yes, render Rainlang in a modal-compatible block:
```text
<rainlang-review title="Rainlang Strategy Review">
...composed Rainlang...
</rainlang-review>
```
4. ALWAYS ask for explicit user confirmation before requesting signature (after any requested review)
5. Display the simulation results and explain what the transaction will do
6. Never request signature if the simulation fails
