---
name: "Token Metadata"
description: "Fetch decoded on-chain asset metadata (location, cash flows, production data)"
version: "1.0.0"
---

To fetch decoded metadata for a token:

```bash
curl -s http://quant-bot-tools.internal:4000/api/tokens/0xf836a500910453A397084ADe41321ee20a5AAde1/metadata
```

Parameters:
- `:address` — The token contract address (must be a valid `0x`-prefixed 40-hex-char address)

Response:
```json
{
  "address": "0xf836a500910453A397084ADe41321ee20a5AAde1",
  "latest": {
    "id": "meta-1",
    "metaHash": "0x...",
    "sender": "0x...",
    "subject": "0x000000000000000000000000...",
    "decodedData": {
      "name": "Asset Name",
      "location": "Asset Location",
      "description": "..."
    },
    "timestamp": 1700000000
  },
  "history": [...]
}
```

The `decodedData` field contains the CBOR-decoded asset metadata. Its structure varies by asset but typically includes:
- `name` — Asset name
- `location` — Physical location
- `description` — Asset description
- Cash flow projections, production data, and other asset-specific fields

Use this tool when the user asks about asset details, metadata, location, or on-chain asset information for a specific token.
