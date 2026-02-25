import { describe, it, expect } from 'vitest';
import { SmaCrossover } from './example.js';
import type { Candle } from '../types/index.js';

function makeCandles(closes: number[]): Candle[] {
	return closes.map((close, i) => ({
		timestamp: Date.now() + i * 3600_000,
		open: close,
		high: close,
		low: close,
		close,
		volume: 100
	}));
}

describe('SmaCrossover', () => {
	it('returns null when not enough data', () => {
		const strategy = new SmaCrossover('BTC/USDT', 3, 5);
		const candles = makeCandles([1, 2, 3]);
		expect(strategy.evaluate(candles)).toBeNull();
	});

	it('generates buy signal on bullish crossover', () => {
		// Flat period where short MA ≈ long MA, then a sharp rise so short crosses above
		// short=3, long=7 — need at least 8 candles
		// [10,10,10,10,10,10,10, 10, 20] — 9 candles
		// offset=1: short3=avg(10,10,10)=10, long7=avg(10,10,10,10,10,10,10)=10
		// offset=0: short3=avg(10,10,20)=13.33, long7=avg(10,10,10,10,10,10,20)=11.43
		// 10<=10 && 13.33>11.43 → no, because 10<=10 is true but we need strict cross (prev <=, curr >)
		// That works! prev: 10<=10 (true), curr: 13.33>11.43 (true) → buy
		const candles = makeCandles([10, 10, 10, 10, 10, 10, 10, 10, 20]);

		const strategy = new SmaCrossover('BTC/USDT', 3, 7);
		const signal = strategy.evaluate(candles);

		expect(signal).not.toBeNull();
		expect(signal!.side).toBe('buy');
		expect(signal!.symbol).toBe('BTC/USDT');
	});

	it('generates sell signal on bearish crossover', () => {
		// Flat period then sharp drop so short crosses below
		const candles = makeCandles([10, 10, 10, 10, 10, 10, 10, 10, 1]);

		const strategy = new SmaCrossover('BTC/USDT', 3, 7);
		const signal = strategy.evaluate(candles);

		expect(signal).not.toBeNull();
		expect(signal!.side).toBe('sell');
	});
});
