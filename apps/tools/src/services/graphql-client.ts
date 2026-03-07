/** Reusable GraphQL client for subgraph queries */

interface GraphQLError {
	message: string;
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: GraphQLError[];
}

export async function executeGraphQL<T>(
	endpoint: string,
	query: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(15_000)
	});

	if (!response.ok) {
		throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
	}

	const result = (await response.json()) as GraphQLResponse<T>;

	if (result.errors?.length) {
		throw new Error(
			`GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`
		);
	}

	if (!result.data) {
		throw new Error('GraphQL response contained no data');
	}

	return result.data;
}
