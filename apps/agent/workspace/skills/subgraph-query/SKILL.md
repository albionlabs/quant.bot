---
name: "Subgraph Query"
description: "Query The Graph subgraphs for onchain data"
version: "1.0.0"
---

To query a subgraph, make an HTTP POST request:

URL: http://quant-bot-tools.internal:4000/api/subgraph/query
Content-Type: application/json

Body:
```json
{
  "subgraph": "raindex-base",
  "query": "{ orders(first: 10, orderBy: timestamp, orderDirection: desc) { id owner { id } timestamp } }",
  "variables": {}
}
```

Parameters:
- `subgraph`: Name of the subgraph to query. Available subgraphs:
  - `raindex-base` - Raindex orderbook on Base
  - `uniswap-v3-base` - Uniswap V3 on Base
- `query`: GraphQL query string
- `variables`: Optional GraphQL variables object

Response: Standard GraphQL response with `data` and optional `errors` fields.

Use this skill when the user asks about onchain data, order history, liquidity positions, token prices, or trading activity. Construct appropriate GraphQL queries based on the user's request.
