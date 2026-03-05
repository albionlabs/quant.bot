import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { storeDelegationViaWebhook, revokeDelegationViaWebhook } from '../services/delegation-client.js';
import type { GatewayConfig } from '../config.js';

interface WebhookPayload {
	eventName: string;
	[key: string]: unknown;
}

function isDelegationStoreResponse(payload: unknown): payload is { delegationId: string } {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		typeof (payload as { delegationId?: unknown }).delegationId === 'string'
	);
}

function verifyWebhookSignature(secret: string, signature: string, payload: object): boolean {
	const hmac = createHmac('sha256', secret);
	hmac.update(JSON.stringify(payload));
	const digest = `sha256=${hmac.digest('hex')}`;
	if (digest.length !== signature.length) return false;
	return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function forwardWebhook(
	app: FastifyInstance,
	reply: FastifyReply,
	call: () => Promise<unknown>,
	errorLogMessage: string
): Promise<unknown> {
	try {
		return await call();
	} catch (err) {
		app.log.error({ err }, errorLogMessage);
		return reply.status(502).send({ error: 'Delegation service error' });
	}
}

export async function webhookRoutes(app: FastifyInstance, config: GatewayConfig): Promise<void> {
	app.post('/api/webhooks/dynamic', async (request, reply) => {
		const signature = request.headers['x-dynamic-signature-256'] as string | undefined;
		const payload = request.body as WebhookPayload;
		if (!signature) {
			return reply.status(401).send({ error: 'Missing webhook signature' });
		}
		if (!verifyWebhookSignature(config.dynamicWebhookSecret, signature, payload)) {
			return reply.status(401).send({ error: 'Invalid webhook signature' });
		}

		app.log.info({ eventName: payload.eventName }, 'Webhook received');

		if (payload.eventName === 'wallet.delegation.revoked') {
			return forwardWebhook(
				app,
				reply,
				() => revokeDelegationViaWebhook(config, payload, signature),
				'Failed to forward revocation to delegation service'
			);
		}

		if (payload.eventName === 'wallet.delegation.created') {
			const result = await forwardWebhook(
				app,
				reply,
				() => storeDelegationViaWebhook(config, payload, signature),
				'Failed to forward delegation to delegation service'
			);
			if (isDelegationStoreResponse(result)) {
				app.log.info({ delegationId: result.delegationId }, 'Delegation stored via delegation service');
			}
			return result;
		}

		return reply.status(400).send({ error: `Unknown event: ${payload.eventName}` });
	});
}
