---
name: "Token Metadata"
description: "Fetch decoded on-chain asset metadata (location, cash flows, production data)"
version: "1.2.0"
---

```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/0xADDRESS/metadata'
```

Optional: `?limit=N` (default 1, max 100) — controls how many history entries to return.

Returns `{ address, display, latest, history }` where `latest` and each history entry contain `{ id, metaHash, sender, subject, decodedData, timestamp }`.

The `decodedData` field contains CBOR-decoded asset metadata (name, location, description, cash flows, production data, etc.).

Include the `display` field verbatim. Only elaborate on specific `decodedData` fields if the user asks.
