---
name: "NPV Calculator"
description: "Calculate Net Present Value and IRR for cash flow analysis"
version: "1.0.0"
---

To calculate NPV, make an HTTP POST request:

URL: http://tools:4000/api/npv
Content-Type: application/json

Body:
```json
{
  "cashFlows": [-1000, 300, 400, 500],
  "discountRate": 0.1
}
```

Parameters:
- `cashFlows`: Array of numbers. First value is typically negative (initial investment). Subsequent values are periodic cash flows.
- `discountRate`: Decimal discount rate (e.g., 0.1 for 10%)

Response:
```json
{
  "npv": 78.82,
  "irr": 0.147
}
```

- `npv`: Net Present Value rounded to 2 decimal places
- `irr`: Internal Rate of Return (may be null if IRR cannot be computed)

Use this tool when the user asks about investment returns, cash flow analysis, or wants to evaluate the profitability of a series of payments.
