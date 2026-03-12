---
name: "NPV Calculator"
description: "Calculate Net Present Value and IRR for cash flow analysis. Use when the user asks for NPV, IRR, discounted cash flow valuation, or wants to evaluate an investment using a series of cash flows and a discount rate."
---

## Call
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/npv \
  -H 'Content-Type: application/json' \
  -d '{"cashFlows": [-1000, 300, 400, 500], "discountRate": 0.1}'
```

## Error Handling
- If the user provides incomplete cash flows or an invalid discount rate, ask for clarification before calling the API.
- If the API returns an error, report it to the user. Do not fabricate results.

## Output (Default)
- One sentence: `NPV=...` and `IRR=...` if available.
- Add assumptions only if missing or ambiguous inputs.

## Stop
- Stop after the computed result.
