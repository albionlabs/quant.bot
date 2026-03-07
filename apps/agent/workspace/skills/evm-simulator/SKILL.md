---
name: "EVM Transaction Simulator"
description: "Simulate EVM transactions on Base before execution"
version: "1.4.0"
---

## Use When
- User asks whether a transaction/call will succeed before signing/executing.

## Required Inputs
- `to` address
- `data` calldata (or `abi` + `functionName` + `args`)
- `from` address (always include)

## Call
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/evm/simulate \
  -H 'Content-Type: application/json' \
  -d '{"from": "0xUSER_ADDRESS", "to": "0x...", "data": "0x...", "value": "0"}'
```

## Output (Default)
- Max 4 bullets:
  - success/failure
  - gas used
  - decoded return data or revert reason
  - proceed/block recommendation

## Stop
- Stop after simulation result and recommendation.

## Never
- Proceed to signing/execution if simulation failed.
