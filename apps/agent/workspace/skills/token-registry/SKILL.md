---
name: "Token Registry"
description: "Look up Albion token addresses, symbols, and decimals from the registry"
version: "1.0.0"
---

To list all tokens in the registry:

```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens
```

To look up a specific token by symbol or address:

```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/ALB-WR1-R1
```

```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/0xf836a500910453A397084ADe41321ee20a5AAde1
```

Parameters:
- `:symbolOrAddress` — Token symbol (e.g., `ALB-WR1-R1`) or address (e.g., `0x...`). Case-insensitive.

Response (list):
```json
{
  "name": "Albion Base Token List",
  "tokens": [
    { "address": "0x...", "symbol": "ALB-WR1-R1", "name": "Albion WR1 Round 1", "decimals": 18 }
  ],
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

Response (lookup):
```json
{
  "token": { "address": "0x...", "symbol": "ALB-WR1-R1", "name": "Albion WR1 Round 1", "decimals": 18 }
}
```

Use this tool when the user asks about available tokens, needs a token address, or wants to know a token's decimals/symbol.
