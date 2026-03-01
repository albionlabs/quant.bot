---
name: "Trades"
description: "Query trade history from the Raindex orderbook"
version: "1.0.0"
---

All requests require HTTP Basic Auth with API key credentials.
Base URL: http://albion.internal:8000

## Get Trades by Address

GET /v1/trades/{address}?page=1&pageSize=20&startTime=1718452800&endTime=1718539200

Parameters:
- `address` (path): Owner address to query trades for
- `page` (query, optional): Page number (default 1)
- `pageSize` (query, optional): Results per page (default 20)
- `startTime` (query, optional): Unix timestamp filter start
- `endTime` (query, optional): Unix timestamp filter end

Response:
```json
{
  "trades": [
    {
      "txHash": "0xabcdef...",
      "inputAmount": "1000000",
      "outputAmount": "500000",
      "inputToken": { "address": "0x...", "symbol": "USDC", "decimals": 6 },
      "outputToken": { "address": "0x...", "symbol": "WETH", "decimals": 18 },
      "orderHash": "0x...",
      "timestamp": 1718452800,
      "blockNumber": 12345678
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalTrades": 100,
    "totalPages": 5,
    "hasMore": true
  }
}
```

## Get Trades by Transaction

GET /v1/trades/tx/{tx_hash}

Response:
```json
{
  "txHash": "0xabcdef...",
  "blockNumber": 12345678,
  "timestamp": 1718452800,
  "sender": "0x...",
  "trades": [
    {
      "orderHash": "0x...",
      "orderOwner": "0x...",
      "request": {
        "inputToken": "0x...",
        "outputToken": "0x...",
        "maximumInput": "1000000",
        "maximumIoRatio": "0.0006"
      },
      "result": {
        "inputAmount": "900000",
        "outputAmount": "500000",
        "actualIoRatio": "0.00055"
      }
    }
  ],
  "totals": {
    "totalInputAmount": "900000",
    "totalOutputAmount": "500000",
    "averageIoRatio": "0.00055"
  }
}
```

Use this skill when the user asks about trade history, past fills, or wants to analyze their trading performance. Combine with the subgraph-query skill for deeper analytics.
