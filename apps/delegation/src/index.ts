import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { delegationRoutes } from './routes.js';

const config = loadConfig();
const app = Fastify({ logger: true });

await app.register((instance) => delegationRoutes(instance, config));

app.get('/api/health', async () => ({ status: 'ok', service: 'delegation', uptime: process.uptime() }));

try {
	await app.listen({ port: config.port, host: config.host });
	console.log(`Delegation service listening on ${config.host}:${config.port}`);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
