# Oil Reserve Strategies

Two strategies are available for oil-backed reserve tokens:

**`oil-token-fair-value-limit`** — Simple limit order at discounted fair value. 6 fields. Best when user wants a straightforward price target.

**`oil-token-fair-value-dca`** — Auction-DCA that gradually sells/buys using a halving auction around the fair value floor. 12 fields (the 6 limit fields + 6 auction parameters). Best for gradual execution with budget controls.

## Shared fields (both strategies)
All values are plain numbers (no units suffix). Timestamps are **unix seconds** (Rainlang `now()` returns seconds).

These 6 fields are identical across both strategies:
- `start-time` — Unix timestamp (seconds) when reserve decay starts. **Auto-fill with current time**: `Math.floor(Date.now() / 1000)`. Mention "starts immediately" so user can override if needed.
- `end-time` — Unix timestamp (seconds) when reserve reaches zero. **Ask the user** — no sensible default. Help convert dates (e.g. "December 2030" → unix timestamp).
- `barrels-of-oil` — Total remaining barrels backing the token. **Fetch from metadata** (see below).
- `token-supply` — Total supply of the reserve token. **Fetch from contract** (see below).
- `oracle-price-timeout` — Oracle staleness limit in seconds (default: 300). Use default unless user specifies.
- `required-discount` — Discount fraction below fair value, e.g. 0.20 = 20%. **Always ask the user** — explain what it means (e.g. "at 0.20, orders execute at 20% below the calculated fair value").

## Fetching field values automatically

### `barrels-of-oil` — from token metadata
The reserve token's on-chain metadata contains production projections. Fetch and sum them:
1. Load metadata:
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/<reserve-token-address>/metadata/load'
```
2. Extract production fields:
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/<reserve-token-address>/metadata/fields?paths=asset.production'
```
3. The response contains production data (e.g. monthly/yearly projections). Sum the remaining production from today onwards to get `barrels-of-oil`. Show the user your calculation and the total so they can confirm or adjust.

### `token-supply` — from contract
Fetch the ERC20 total supply directly:
```bash
curl -s 'http://quant-bot-tools.internal:4000/api/tokens/<reserve-token-address>/supply'
```
Response: `{"address":"0x...","source":"rpc","totalSupply":"1000000000000000000000","decimals":18,"formatted":"1000.0"}`
The endpoint reads on-chain via RPC; if RPC fails it falls back to token metadata automatically (`source` will be `"metadata"`).
Use the `formatted` value for the `token-supply` field. Show the user so they can confirm.

## Helping the user with field values
- **`start-time`**: Auto-fill with current unix timestamp. Mention it in the summary ("starts immediately") so the user can override if needed.
- **`end-time`**: Help the user convert a date to unix timestamp. E.g. "December 2030" → compute `Math.floor(new Date('2030-12-31').getTime()/1000)`.
- **`barrels-of-oil`**: Fetch from metadata (see above). If metadata is unavailable, ask the user directly.
- **`token-supply`**: Fetch from contract (see above). If the call fails, ask the user directly.
- **`required-discount`**: Always ask. Explain the tradeoff: higher discount = more conservative pricing = fewer fills but better value.
- **`amount-per-epoch`** (DCA only): This is the budget per period in the `output` token. Help the user work backwards from their total budget.
- **`time-per-amount-epoch`** and **`time-per-trade-epoch`** (DCA only): These have presets (60s, 3600s, 86400s, etc.). Suggest a reasonable default and explain the tradeoff (shorter = more frequent auctions).

## Deploying both strategies
If the user wants both limit and DCA deployed:
1. Get details for **both** strategy keys (2 calls).
2. Collect field values **once** for the 6 shared fields, then collect the 6 DCA-specific fields.
3. Deploy each strategy separately (2 deploy calls). Total: **4 calls** (2 details + 2 deploys).
4. Each deploy produces its own `<tx-sign>`. Present them sequentially — first deploy, confirm, sign, then second deploy, confirm, sign.
