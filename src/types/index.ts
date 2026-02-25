export interface BotConfig {
	dryRun: boolean;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	exchange: ExchangeConfig;
}

export interface ExchangeConfig {
	apiKey: string;
	apiSecret: string;
}

export interface Candle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface Order {
	id: string;
	symbol: string;
	side: 'buy' | 'sell';
	type: 'market' | 'limit';
	price: number;
	amount: number;
	status: 'open' | 'filled' | 'cancelled';
	timestamp: number;
}

export interface Signal {
	symbol: string;
	side: 'buy' | 'sell';
	price: number;
	amount: number;
	confidence: number;
}

export interface Strategy {
	name: string;
	evaluate(candles: Candle[]): Signal | null;
}
