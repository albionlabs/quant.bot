import type { FastifyInstance } from 'fastify';
import { storeDelegationViaWebhook, revokeDelegationViaWebhook } from '../services/delegation-client.js';
import type { GatewayConfig } from '../config.js';

interface WebhookPayload {
	eventName: string;
	[key: string]: unknown;
}

export async function webhookRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.post('/api/webhooks/dynamic', async (request, reply) => {
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;
		const payload = request.body as WebhookPayload;

		app.log.info({ eventName: payload.eventName }, 'Webhook received');

		if (payload.eventName === 'wallet.delegation.revoked') {
			try {
				return await revokeDelegationViaWebhook(config, payload, signature);
			} catch (err) {
				app.log.error({ err }, 'Failed to forward revocation to delegation service');
				return reply.status(502).send({ error: 'Delegation service error' });
			}
		}

		if (payload.eventName === 'wallet.delegation.created') {
			try {
				const result = await storeDelegationViaWebhook(config, payload, signature);
				app.log.info({ delegationId: result.delegationId }, 'Delegation stored via delegation service');
				return result;
			} catch (err) {
				app.log.error({ err }, 'Failed to forward delegation to delegation service');
				return reply.status(502).send({ error: 'Delegation service error' });
			}
		}

		return reply.status(400).send({ error: `Unknown event: ${payload.eventName}` });
	});
}
