import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { loadConfig } from './config.js';
import { registerRateLimit } from './middleware/rate-limit.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';
import { connectToAgent } from './services/agent-proxy.js';

const config = loadConfig();
const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);
await registerRateLimit(app, config);

await app.register(healthRoutes);
await app.register((instance) => authRoutes(instance, config));
await app.register((instance) => chatRoutes(instance, config));

// Attempt agent connection (non-blocking - gateway starts even if agent is down)
connectToAgent(config).catch((err) => {
	app.log.warn(`Failed to connect to agent: ${err.message}. Will retry on first request.`);
});

try {
	await app.listen({ port: config.port, host: config.host });
	console.log(`Gateway listening on ${config.host}:${config.port}`);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
