---
name: "Token Metadata"
description: "Retrieve supported token information from the registry"
version: "1.0.0"
---

All requests require HTTP Basic Auth with API key credentials.
Base URL: http://albion.internal:8000

## Get Token List

GET /v1/tokens

Returns the list of supported tokens on Base, filtered from the on-chain token registry.

Response:
```json
{
  "tokens": [
    {
      "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "symbol": "USDC",
      "name": "USD Coin",
      "ISIN": "US1234567890",
      "decimals": 6
    }
  ]
}
```

Fields:
- `address`: Token contract address on Base
- `symbol`: Token ticker symbol
- `name`: Full token name
- `ISIN`: International Securities Identification Number (present for tokenized securities, omitted otherwise)
- `decimals`: Token decimal places

Use this skill when the user asks about available tokens, token addresses, symbols, or decimals. This replaces the old onchain-metadata skill and provides curated token information from the registry rather than raw bytecode analysis.
