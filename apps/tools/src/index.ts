import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { npvRoutes } from './routes/npv.js';
import { evmSimulateRoutes } from './routes/evm-simulate.js';
import { txExecuteRoutes } from './routes/tx-execute.js';
import { subgraphRoutes } from './routes/subgraph.js';
import { orderbookRoutes } from './routes/orderbook.js';

const config = loadConfig();
const app = Fastify({ logger: true });

await app.register(npvRoutes);
await app.register((instance) => evmSimulateRoutes(instance, config));
await app.register((instance) => txExecuteRoutes(instance, config));
await app.register((instance) => subgraphRoutes(instance, config));
await app.register((instance) => orderbookRoutes(instance, config));

app.get('/api/health', async () => ({ status: 'ok', service: 'tools', uptime: process.uptime() }));

try {
	await app.listen({ port: config.port, host: config.host });
	console.log(`Tools service listening on ${config.host}:${config.port}`);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
