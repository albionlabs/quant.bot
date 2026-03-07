---
name: "Token Registry"
description: "Look up Albion token addresses, symbols, and decimals from the registry"
version: "1.2.0"
---

List all tokens:
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens
```

Look up by symbol or address:
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/ALB-WR1-R1
```

Returns `{ token: { address, symbol, name, decimals } }` for lookups, or `{ name, tokens, updatedAt }` for the full list.

List matching tokens concisely: symbol, name, address on one line each.
