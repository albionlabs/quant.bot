---
name: "Trade History"
description: "View recent trade history for tokens on the Raindex orderbook"
version: "1.0.0"
---

To fetch recent trades for a token:

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/exchange/trades/0xf836a500910453A397084ADe41321ee20a5AAde1?limit=50'
```

Parameters:
- `:tokenAddress` — The token contract address
- `?limit` — Optional. Number of trades to return, 1-100 (default: 50)

Response:
```json
{
  "tokenAddress": "0x...",
  "trades": [
    {
      "id": "trade-1",
      "orderHash": "0x...",
      "timestamp": 1700000000,
      "input": {
        "token": "0x...",
        "symbol": "USDC",
        "decimals": 6,
        "amount": "1000000"
      },
      "output": {
        "token": "0x...",
        "symbol": "ALB-WR1-R1",
        "decimals": 18,
        "amount": "500000000000000000"
      },
      "txHash": "0x..."
    }
  ],
  "total": 50
}
```

- `trades` — Array of trades sorted by timestamp descending (most recent first)
- `input`/`output` — Token amounts involved in each trade (raw amounts, apply decimals for human-readable values)
- Data is merged from both v6 and legacy subgraphs for completeness

Use this tool when the user asks about recent trades, trading activity, or trade history for a token.
