import type { NpvRequest, NpvResponse } from '@quant-bot/shared-types';

export function calculateNpv(cashFlows: number[], discountRate: number): number {
	return cashFlows.reduce((npv, cf, t) => npv + cf / Math.pow(1 + discountRate, t), 0);
}

export function calculateIrr(cashFlows: number[], tolerance = 1e-7, maxIterations = 1000): number | undefined {
	let low = -0.99;
	let high = 10.0;

	const npvAt = (rate: number) => cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);

	if (npvAt(low) * npvAt(high) > 0) return undefined;

	for (let i = 0; i < maxIterations; i++) {
		const mid = (low + high) / 2;
		const npvMid = npvAt(mid);

		if (Math.abs(npvMid) < tolerance) return mid;

		if (npvAt(low) * npvMid < 0) {
			high = mid;
		} else {
			low = mid;
		}
	}

	return (low + high) / 2;
}

export function handleNpv(request: NpvRequest): NpvResponse {
	const npv = calculateNpv(request.cashFlows, request.discountRate);
	const irr = calculateIrr(request.cashFlows);
	return {
		npv: Math.round(npv * 100) / 100,
		irr: irr !== undefined ? Math.round(irr * 10000) / 10000 : undefined
	};
}
