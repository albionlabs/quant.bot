import type { BotConfig } from '../types/index.js';

export function loadConfig(): BotConfig {
	return {
		dryRun: process.env.DRY_RUN !== 'false',
		logLevel: (process.env.LOG_LEVEL as BotConfig['logLevel']) ?? 'info',
		exchange: {
			apiKey: process.env.EXCHANGE_API_KEY ?? '',
			apiSecret: process.env.EXCHANGE_API_SECRET ?? ''
		}
	};
}
