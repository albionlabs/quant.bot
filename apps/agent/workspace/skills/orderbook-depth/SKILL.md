---
name: "Orderbook Depth"
description: "View orderbook depth with live quotes for tokens on the Raindex orderbook"
version: "1.0.0"
---

To fetch orderbook depth for a token:

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/orderbook/0xf836a500910453A397084ADe41321ee20a5AAde1?side=both'
```

Parameters:
- `:tokenAddress` — The token contract address
- `?side` — Optional. `buy`, `sell`, or `both` (default: `both`)

Response:
```json
{
  "tokenAddress": "0x...",
  "bids": [
    {
      "orderHash": "0x...",
      "owner": "0x...",
      "price": 1.5,
      "maxOutput": "100",
      "ratio": "1.5",
      "inputToken": "0x...",
      "outputToken": "0x..."
    }
  ],
  "asks": [...],
  "bestBid": 1.5,
  "bestAsk": 1.6,
  "spread": 0.1
}
```

- `bids` — Orders offering to buy the token (sorted by price descending)
- `asks` — Orders offering to sell the token (sorted by price ascending)
- `price` — Live quoted price from the Raindex MCP (null if quote unavailable)
- `maxOutput` — Maximum output amount from the live quote
- `spread` — Difference between best ask and best bid

Use this tool when the user asks about current prices, orderbook depth, bid/ask spreads, or liquidity for a token.
