---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook"
version: "1.3.0"
---

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/orderbook/0xTOKEN_ADDRESS?side=both'
```

Parameters: `:tokenAddress` (contract address), `?side` (`buy`, `sell`, or `both`, default: `both`), `?detail=true` (include full `bids`/`asks` arrays).

Side aliases:
- `ask` means `sell`
- `bid` means `buy`
- The API only accepts `buy|sell|both`, so always normalize aliases before calling.

Default response: `{ tokenAddress, display, bestBid, bestAsk, spread, bidCount, askCount }`.
Detail response adds: `bids[]` and `asks[]` with `{ orderHash, price, maxOutput, inputToken, outputToken }`.

Include the `display` field verbatim. If the user asks about specific orders or needs detailed analysis, re-call with `?detail=true`. Add a 1-sentence summary only if relevant.
