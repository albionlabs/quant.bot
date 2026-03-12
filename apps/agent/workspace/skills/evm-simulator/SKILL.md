---
name: "EVM Transaction Simulator"
description: "Simulate EVM transactions on Base before execution. Use when the user asks to simulate, dry-run, test, or check whether a transaction or contract call will succeed before signing or executing it."
---

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

## Error Handling
- If the API returns a non-200 status or network error, report the error to the user. Do not fabricate a simulation result.

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
