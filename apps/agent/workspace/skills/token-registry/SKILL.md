---
name: "Token Registry"
description: "Look up Albion token addresses, symbols, and decimals from the registry. Use when the user asks for a token address, token symbol, token decimals, wants to find a token by name, or asks 'what's the address for...'."
---

## Default Call (Targeted)
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/ALB-WR1-R1
```

## Only If Explicitly Requested
```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens
```

## Error Handling
- If the targeted lookup returns no match, inform the user the token was not found. Do not guess an address.

## Output (Default)
- One line per token: `symbol | name | address | decimals`
- Max 10 lines unless user asks for full list.

## Stop
- Stop after direct match or requested subset.
