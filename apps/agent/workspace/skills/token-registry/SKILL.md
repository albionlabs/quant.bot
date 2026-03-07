---
name: "Token Registry"
description: "Look up Albion token addresses, symbols, and decimals from the registry"
version: "1.4.0"
---

## Use When
- User asks for token address/symbol/decimals.

## Default Call (Targeted)
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/ALB-WR1-R1
```

## Only If Explicitly Requested
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens
```

## Output (Default)
- One line per token: `symbol | name | address | decimals`
- Max 10 lines unless user asks for full list.

## Stop
- Stop after direct match or requested subset.
