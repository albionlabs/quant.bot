---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook"
version: "1.6.0"
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

## IO Ratio Semantics
- Quotes return **IO ratios** (input/output), NOT direct prices.
- **Ask** (sell token for USDC): ioratio = USDC/token → this IS the USD price.
- **Bid** (buy token with USDC): ioratio = token/USDC → USD price = **1 / ioratio**.
- The `price` field in the response already applies this inversion — use it directly.

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
