---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook"
version: "1.5.0"
---

## Use When
- User asks for orderbook depth, bid/ask, spread, or liquidity snapshot.

## Inputs
- `tokenAddress`
- optional `side`: `buy|sell|both` (`bid->buy`, `ask->sell`)
- optional `detail=true` only for full order list

## Call
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/orderbook/0xTOKEN_ADDRESS?side=both'
```

## Output (Default)
- Max 4 bullets:
  - best bid
  - best ask
  - spread
  - bid/ask counts + short interpretation

## Only When Needed
- Include `display` or full `bids[]/asks[]` only if explicitly requested.

## Stop
- Stop after concise snapshot.
