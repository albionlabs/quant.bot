import { loadConfig } from './config/index.js';
import { ExchangeService } from './services/exchange.js';
import { SmaCrossover } from './strategies/example.js';
import { logger, setLogLevel } from './utils/logger.js';

async function main() {
	const config = loadConfig();
	setLogLevel(config.logLevel);

	logger.info('Starting quant.bot', { dryRun: config.dryRun });

	const exchange = new ExchangeService(config.exchange);
	const strategy = new SmaCrossover('BTC/USDT');

	const candles = await exchange.fetchCandles('BTC/USDT', '1h', 100);

	if (candles.length === 0) {
		logger.warn('No candle data available — skipping evaluation');
		return;
	}

	const signal = strategy.evaluate(candles);

	if (signal) {
		logger.info('Signal generated', signal);

		if (config.dryRun) {
			logger.info('Dry run mode — not placing order');
		} else {
			await exchange.placeOrder(signal.symbol, signal.side, 'limit', signal.amount, signal.price);
		}
	} else {
		logger.info('No signal');
	}
}

main().catch((err) => {
	logger.error('Fatal error', err);
	process.exit(1);
});
