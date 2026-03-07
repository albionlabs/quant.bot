---
name: "NPV Calculator"
description: "Calculate Net Present Value and IRR for cash flow analysis"
version: "1.2.0"
---

```bash
curl -s -X POST http://quant-bot-tools.internal:4000/api/npv \
  -H 'Content-Type: application/json' \
  -d '{"cashFlows": [-1000, 300, 400, 500], "discountRate": 0.1}'
```

Parameters: `cashFlows` (array, first value typically negative for initial investment), `discountRate` (decimal, e.g. 0.1 for 10%).

Returns `{ npv, irr }`. IRR may be null if it cannot be computed.

State NPV (and IRR if calculated) in one sentence.
