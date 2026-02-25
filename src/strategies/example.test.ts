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
		// Build a series where short MA starts below long MA then crosses above
		const declining = Array.from({ length: 30 }, (_, i) => 100 - i * 0.5);
		const rising = [90, 92, 95, 98, 102, 106, 110, 115, 120, 126, 132];
		const candles = makeCandles([...declining, ...rising]);

		const strategy = new SmaCrossover('BTC/USDT', 5, 20);
		const signal = strategy.evaluate(candles);

		expect(signal).not.toBeNull();
		expect(signal!.side).toBe('buy');
		expect(signal!.symbol).toBe('BTC/USDT');
	});

	it('generates sell signal on bearish crossover', () => {
		const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
		const falling = [115, 112, 108, 104, 99, 94, 88, 82, 76, 70, 64];
		const candles = makeCandles([...rising, ...falling]);

		const strategy = new SmaCrossover('BTC/USDT', 5, 20);
		const signal = strategy.evaluate(candles);

		expect(signal).not.toBeNull();
		expect(signal!.side).toBe('sell');
	});
});
