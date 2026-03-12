---
name: "Token Metadata"
description: "Fetch decoded on-chain asset metadata (location, cash flows, production data). Use when the user asks about token metadata, asset details, production projections, payout data, or wants to inspect decoded on-chain data for a token address."
---

## Two-Step Flow (preferred)
Use the two-step flow to avoid flooding context with large metadata payloads.

### Step 1 — Load
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/0xADDRESS/metadata/load'
```
Returns a **schema** of available fields (names, types, array lengths) without values.
Use this to understand what data is available before querying.

### Step 2 — Query specific fields
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/0xADDRESS/metadata/fields?paths=asset.location,payoutData'
```
Returns only the requested subtrees. Use comma-separated dot-paths.

## Legacy (single call)
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/0xADDRESS/metadata'
```
Returns truncated metadata in one response. Use only when you need the full overview.

## Defaults
- Always start with `/metadata/load` to see the schema.
- Query only the fields relevant to the user's question.

## Output (Default)
- Max 5 bullets from the queried fields (most decision-relevant).

## Only When Needed
- Include raw `display` or large `history` only if explicitly requested.

## Stop
- Stop after concise metadata summary.
