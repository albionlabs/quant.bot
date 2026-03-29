import { describe, it, expect } from 'vitest';
import { semverLt } from './version.js';

describe('semverLt', () => {
	it('returns true when major is less', () => {
		expect(semverLt('0.1.0', '1.0.0')).toBe(true);
	});

	it('returns true when minor is less', () => {
		expect(semverLt('0.1.0', '0.2.0')).toBe(true);
	});

	it('returns true when patch is less', () => {
		expect(semverLt('0.1.0', '0.1.1')).toBe(true);
	});

	it('returns false when equal', () => {
		expect(semverLt('1.2.3', '1.2.3')).toBe(false);
	});

	it('returns false when greater', () => {
		expect(semverLt('2.0.0', '1.9.9')).toBe(false);
	});

	it('handles missing patch as zero', () => {
		expect(semverLt('1.0', '1.0.1')).toBe(true);
	});

	it('compares major before minor', () => {
		expect(semverLt('1.9.9', '2.0.0')).toBe(true);
		expect(semverLt('2.0.0', '1.9.9')).toBe(false);
	});
});
