import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { npvRoutes } from './routes/npv.js';
import { evmSimulateRoutes } from './routes/evm-simulate.js';
import { raindexStrategyRoutes } from './routes/raindex-strategy.js';
import { tokenRegistryRoutes } from './routes/token-registry.js';
import { tokenMetadataRoutes } from './routes/token-metadata.js';
import { orderbookRoutes } from './routes/orderbook.js';
import { tradeHistoryRoutes } from './routes/trade-history.js';
import { raindexOrderUrlRoutes } from './routes/raindex-order-url.js';
import { ownerOrdersRoutes } from './routes/owner-orders.js';
import { customStrategiesRoutes } from './routes/custom-strategies.js';
import { signingRoutes } from './routes/signing.js';
import { tokenSupplyRoutes } from './routes/token-supply.js';

const config = loadConfig();
const app = Fastify({ logger: true });

// Config-free routes
await app.register(npvRoutes);
await app.register(tokenMetadataRoutes);  // more specific path first
await app.register(tokenRegistryRoutes);
await app.register(tradeHistoryRoutes);
await app.register(raindexOrderUrlRoutes);
await app.register(ownerOrdersRoutes);

// Config-dependent routes
await app.register((instance) => evmSimulateRoutes(instance, config));
await app.register((instance) => raindexStrategyRoutes(instance, config));
await app.register((instance) => orderbookRoutes(instance, config));
await app.register((instance) => signingRoutes(instance, config));
await app.register((instance) => tokenSupplyRoutes(instance, config));
if (config.customStrategiesDir) {
	await app.register((instance) => customStrategiesRoutes(instance, config));
}

app.get('/api/health', async () => ({
	status: 'ok',
	service: 'tools',
	version: process.env.COMMIT_SHA ?? 'dev',
	uptime: process.uptime()
}));

try {
	await app.listen({ port: config.port, host: config.host });
	console.log(`Tools service listening on ${config.host}:${config.port}`);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
