import type { FastifyInstance } from 'fastify';
import { isAgentConnected } from '../services/agent-proxy.js';

export async function healthRoutes(app: FastifyInstance) {
	app.get('/api/health', async () => ({
		status: 'ok',
		service: 'gateway',
		version: process.env.COMMIT_SHA ?? 'dev',
		agentConnected: isAgentConnected(),
		uptime: process.uptime()
	}));
}
