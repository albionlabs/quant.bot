---
name: "Trade History"
description: "View recent trade history for tokens on the Raindex orderbook"
version: "1.4.0"
---

## Use When
- User asks for recent trades/activity for a token.

## Defaults
- Use `limit=20` unless user asks otherwise.

## Call
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/trades/0xTOKEN_ADDRESS?limit=20'
```

## Output (Default)
- Max 3 bullets:
  - total trades
  - short pattern summary
  - notable anomaly only if present

## Only When Needed
- Use `detail=true` and include raw trades only if explicitly requested.

## Stop
- Stop after concise activity summary.
