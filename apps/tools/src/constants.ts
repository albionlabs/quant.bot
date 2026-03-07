/** Goldsky subgraph endpoints */
export const ORDERBOOK_SUBGRAPH_V6 =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn';

export const ORDERBOOK_SUBGRAPH_LEGACY =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn';

export const METADATA_SUBGRAPH =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn';

/** Token registry */
export const TOKEN_REGISTRY_URL =
	'https://raw.githubusercontent.com/albionlabs/albion.registry/main/token-lists/base.json';

/** Well-known addresses */
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const ORDERBOOK_ADDRESS = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D';

/** Chain config */
export const CHAIN_ID = 8453;

/** Raindex */
export const RAINDEX_BASE_URL = 'https://v6.raindex.finance';
export const RAINDEX_ORDERBOOK_ADDRESS = '0x52ceb8ebef648744ffdde89f7bc9c3ac35944775';

/** CBOR magic numbers for Rain meta decoding */
export const MAGIC_NUMBERS = {
	OA_SCHEMA: 0xffa8e8a9b9cf4a31n
} as const;
