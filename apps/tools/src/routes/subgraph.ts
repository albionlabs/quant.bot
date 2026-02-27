import type { FastifyInstance } from 'fastify';
import type { SubgraphQueryRequest } from '@quant-bot/shared-types';
import { querySubgraph } from '../services/subgraph-query.js';
import type { ToolsConfig } from '../config.js';

export async function subgraphRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: SubgraphQueryRequest }>('/api/subgraph/query', async (request, reply) => {
		const { subgraph, query } = request.body;

		if (!subgraph || typeof subgraph !== 'string') {
			return reply.status(400).send({ error: 'subgraph name is required' });
		}
		if (!query || typeof query !== 'string') {
			return reply.status(400).send({ error: 'GraphQL query is required' });
		}

		try {
			return await querySubgraph(request.body, config.allowedSubgraphs);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Subgraph query failed';
			return reply.status(500).send({ error: message });
		}
	});
}
