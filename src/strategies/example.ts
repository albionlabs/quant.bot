import type { Candle, Signal, Strategy } from '../types/index.js';

/**
 * Simple moving average crossover strategy.
 * Generates a buy signal when the short MA crosses above the long MA,
 * and a sell signal when it crosses below.
 */
export class SmaCrossover implements Strategy {
	name = 'sma-crossover';
	private shortPeriod: number;
	private longPeriod: number;
	private symbol: string;

	constructor(symbol: string, shortPeriod = 10, longPeriod = 30) {
		this.symbol = symbol;
		this.shortPeriod = shortPeriod;
		this.longPeriod = longPeriod;
	}

	evaluate(candles: Candle[]): Signal | null {
		if (candles.length < this.longPeriod + 1) return null;

		const closes = candles.map((c) => c.close);

		const shortMaCurrent = sma(closes, this.shortPeriod, 0);
		const shortMaPrev = sma(closes, this.shortPeriod, 1);
		const longMaCurrent = sma(closes, this.longPeriod, 0);
		const longMaPrev = sma(closes, this.longPeriod, 1);

		const price = closes[closes.length - 1];

		if (shortMaPrev <= longMaPrev && shortMaCurrent > longMaCurrent) {
			return { symbol: this.symbol, side: 'buy', price, amount: 1, confidence: 0.6 };
		}

		if (shortMaPrev >= longMaPrev && shortMaCurrent < longMaCurrent) {
			return { symbol: this.symbol, side: 'sell', price, amount: 1, confidence: 0.6 };
		}

		return null;
	}
}

function sma(values: number[], period: number, offset: number): number {
	const end = values.length - offset;
	const start = end - period;
	const slice = values.slice(start, end);
	return slice.reduce((sum, v) => sum + v, 0) / period;
}
