import { getChain } from '@quant-bot/evm-utils';
import type { FastifyInstance } from 'fastify';
import type {
	TxExecuteRequest,
	TxRequestSignatureRequest,
	TxRequestSignatureResponse
} from '@quant-bot/shared-types';
import { resolveUserIdFromExecutionToken } from '../services/execution-token.js';
import type { ToolsConfig } from '../config.js';

function parseWei(value?: string): bigint {
	if (value === undefined || value === null || value === '') return 0n;
	if (typeof value !== 'string') {
		throw new Error('Invalid "value" field');
	}

	if (value.startsWith('0x')) {
		return BigInt(value);
	}

	if (!/^\d+$/.test(value)) {
		throw new Error('Invalid "value" field. Expected wei as decimal string or 0x hex string');
	}

	return BigInt(value);
}

function normalizeHexData(data: string): string {
	if (!data.startsWith('0x')) {
		throw new Error('Invalid "data" field');
	}
	if ((data.length - 2) % 2 !== 0) {
		throw new Error('Invalid "data" field length');
	}
	return data.toLowerCase();
}

function dataLengthBytes(data: string): number {
	return Math.max(0, (data.length - 2) / 2);
}

export async function txExecuteRoutes(app: FastifyInstance, config: ToolsConfig) {
	app.post<{ Body: TxRequestSignatureRequest }>('/api/evm/request-signature', async (request, reply) => {
		const requestStarted = Date.now();
		const reqId = String(request.id);
		const { to, data, executionToken } = request.body;

		if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
			return reply.status(400).send({ error: 'Invalid "to" address' });
		}
		if (!data || typeof data !== 'string') {
			return reply.status(400).send({ error: 'Invalid "data" field' });
		}
		if (!executionToken || typeof executionToken !== 'string') {
			return reply.status(400).send({ error: 'executionToken is required' });
		}

		let userId: string;
		let valueWei: bigint;
		let normalizedData: string;
		try {
			userId = await resolveUserIdFromExecutionToken(executionToken, config.internalSecret);
			valueWei = parseWei(request.body.value);
			normalizedData = normalizeHexData(data);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid request payload';
			const statusCode = message.toLowerCase().includes('execution token') ? 401 : 400;
			return reply.status(statusCode).send({ error: message });
		}

		const chain = getChain(config.chainName);
		const payload: TxRequestSignatureResponse = {
			kind: 'evm_send_transaction',
			chainId: chain.id,
			from: userId,
			to,
			data: normalizedData,
			value: valueWei.toString(),
			summary: {
				to,
				valueWei: valueWei.toString(),
				dataBytes: dataLengthBytes(normalizedData)
			}
		};

		app.log.info(
			{ reqId, elapsedMs: Date.now() - requestStarted, from: payload.from, to: payload.to, dataBytes: payload.summary.dataBytes },
			'/api/evm/request-signature prepared payload'
		);

		return payload;
	});

	app.post<{ Body: TxExecuteRequest }>('/api/evm/execute', async (_request, reply) => {
		return reply.status(410).send({
			error: 'Delegated server-side execution is disabled. Use /api/evm/request-signature and sign on the client.'
		});
	});
}
