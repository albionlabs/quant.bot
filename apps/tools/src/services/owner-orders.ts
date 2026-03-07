import { executeGraphQL } from './graphql-client.js';
import { ORDERBOOK_SUBGRAPH_V6 } from '../constants.js';

interface SubgraphToken {
	address: string;
	symbol: string | null;
	decimals: string | null;
}

interface SubgraphVault {
	token: SubgraphToken;
	balance: string;
}

interface SubgraphOrder {
	orderHash: string;
	owner: string;
	active: boolean;
	timestampAdded: string;
	inputs: SubgraphVault[];
	outputs: SubgraphVault[];
}

interface OrdersQueryResult {
	orders: SubgraphOrder[];
}

export interface OwnerOrder {
	orderHash: string;
	owner: string;
	active: boolean;
	timestampAdded: number;
	inputs: { token: string; symbol: string | null; decimals: number | null; balance: string }[];
	outputs: { token: string; symbol: string | null; decimals: number | null; balance: string }[];
}

const OWNER_ORDERS_QUERY = `
query OwnerOrders($owner: Bytes!, $first: Int!) {
  orders(
    where: { owner: $owner }
    orderBy: timestampAdded
    orderDirection: desc
    first: $first
  ) {
    orderHash
    owner
    active
    timestampAdded
    inputs {
      token {
        address
        symbol
        decimals
      }
      balance
    }
    outputs {
      token {
        address
        symbol
        decimals
      }
      balance
    }
  }
}
`;

export async function fetchOwnerOrders(
	owner: string,
	limit: number
): Promise<OwnerOrder[]> {
	const data = await executeGraphQL<OrdersQueryResult>(
		ORDERBOOK_SUBGRAPH_V6,
		OWNER_ORDERS_QUERY,
		{ owner: owner.toLowerCase(), first: limit }
	);

	return data.orders.map((o) => ({
		orderHash: o.orderHash,
		owner: o.owner,
		active: o.active,
		timestampAdded: parseInt(o.timestampAdded, 10),
		inputs: o.inputs.map((v) => ({
			token: v.token.address,
			symbol: v.token.symbol,
			decimals: v.token.decimals ? parseInt(v.token.decimals, 10) : null,
			balance: v.balance
		})),
		outputs: o.outputs.map((v) => ({
			token: v.token.address,
			symbol: v.token.symbol,
			decimals: v.token.decimals ? parseInt(v.token.decimals, 10) : null,
			balance: v.balance
		}))
	}));
}
