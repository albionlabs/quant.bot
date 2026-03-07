---
name: "Trade History"
description: "View recent trade history for tokens on the Raindex orderbook"
version: "1.2.0"
---

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/trades/0xTOKEN_ADDRESS?limit=50'
```

Parameters: `:tokenAddress` (contract address), `?limit` (1-100, default: 50), `?detail=true` (include full `trades` array).

Default response: `{ tokenAddress, display, total }`.
Detail response adds: `trades[]` with `{ orderHash, timestamp, input, output, txHash }` where input/output have `{ token, symbol, decimals, amount, readableAmount }`.

Include the `display` field verbatim. Re-call with `?detail=true` only if the user asks about specific trades. Summarize trading pattern in 1 sentence if relevant.
