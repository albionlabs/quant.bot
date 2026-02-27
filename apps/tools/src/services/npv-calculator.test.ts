import { describe, it, expect } from 'vitest';
import { calculateNpv, calculateIrr, handleNpv } from './npv-calculator.js';

describe('calculateNpv', () => {
	it('calculates NPV for a simple cash flow', () => {
		// -1000 + 300/1.1 + 400/1.21 + 500/1.331 = -21.04
		const npv = calculateNpv([-1000, 300, 400, 500], 0.1);
		expect(npv).toBeCloseTo(-21.04, 1);
	});

	it('returns 0 for empty cash flows', () => {
		expect(calculateNpv([], 0.1)).toBe(0);
	});

	it('returns the cash flow itself at 0% discount rate', () => {
		const npv = calculateNpv([-1000, 500, 500], 0);
		expect(npv).toBe(0);
	});

	it('handles negative NPV', () => {
		const npv = calculateNpv([-1000, 100, 100], 0.1);
		expect(npv).toBeLessThan(0);
	});
});

describe('calculateIrr', () => {
	it('calculates IRR for a simple cash flow', () => {
		const irr = calculateIrr([-1000, 300, 400, 500]);
		expect(irr).toBeDefined();
		expect(irr!).toBeCloseTo(0.0889, 2);
	});

	it('returns undefined when IRR cannot be found', () => {
		const irr = calculateIrr([1000, 500, 500]);
		expect(irr).toBeUndefined();
	});
});

describe('handleNpv', () => {
	it('returns NPV and IRR', () => {
		const result = handleNpv({ cashFlows: [-1000, 300, 400, 500], discountRate: 0.1 });
		expect(result.npv).toBeCloseTo(-21.04, 1);
		expect(result.irr).toBeDefined();
	});
});
