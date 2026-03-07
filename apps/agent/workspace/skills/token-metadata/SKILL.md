---
name: "Token Metadata"
description: "Fetch decoded on-chain asset metadata (location, cash flows, production data)"
version: "1.4.0"
---

## Use When
- User asks for decoded metadata for a token/address.

## Call
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/0xADDRESS/metadata'
```

## Defaults
- Use `limit=1` unless user asks for history.

## Output (Default)
- Max 5 bullets from `latest.decodedData` (most decision-relevant fields).

## Only When Needed
- Include raw `display` or large `history` only if explicitly requested.

## Stop
- Stop after concise metadata summary.
