---
name: "NPV Calculator"
description: "Calculate Net Present Value and IRR for cash flow analysis"
version: "1.3.0"
---

## Use When
- User asks for NPV/IRR from cash flows and discount rate.

## Call
```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/npv \
  -H 'Content-Type: application/json' \
  -d '{"cashFlows": [-1000, 300, 400, 500], "discountRate": 0.1}'
```

## Output (Default)
- One sentence: `NPV=...` and `IRR=...` if available.
- Add assumptions only if missing or ambiguous inputs.

## Stop
- Stop after the computed result.
