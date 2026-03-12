---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook. Use when the user asks about orderbook depth, bid/ask prices, spread, liquidity, market depth, or wants a price snapshot for a token."
---

## Inputs
- `tokenAddress`
- optional `side`: `buy|sell|both` (`bid->buy`, `ask->sell`)
- optional `detail=true` only for full order list

## Call
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/orderbook/0xTOKEN_ADDRESS?side=both'
```

## Response Fields
- Use `bestBid`, `bestAsk`, `spread`, and the `price` field on individual orders. These are already converted to USD prices (USDC per token).

## Non-USD Pairs
- Orders where neither token is USDC have `price: null` and include an `ioRatio` field.
- Use the `ioRatio` field with `inputSymbol`/`outputSymbol` to present the rate.
- Format as: `{ioRatio} {inputSymbol}/{outputSymbol}` (e.g. "10.0000 WETH/TOKEN").
- Do NOT prefix with `$` — these are not USD prices.

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
