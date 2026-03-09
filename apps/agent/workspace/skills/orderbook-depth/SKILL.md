---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook"
version: "1.7.0"
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

## Response Fields — READ CAREFULLY
- **ALWAYS use `bestBid`, `bestAsk`, `spread`, and the `price` field on individual orders.** These are already converted to USD prices (USDC per token).
- **NEVER use `ioRatio` as a dollar price.** The `ioRatio` field is a raw on-chain ratio — for bids it is token/USDC (inverted), so displaying it as a price gives a wrong number (e.g. ioRatio=10 means $0.10/token, NOT $10). The `price` field already handles the conversion.
- `ioRatio` is ONLY useful for non-USD pairs (see below). For all USD pairs, ignore it.

## Non-USD Pairs
- Orders where neither token is USDC have `price: null`.
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
