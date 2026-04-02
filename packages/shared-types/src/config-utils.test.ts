import { describe, it, expect } from 'vitest';
import { requireNonEmpty } from './config-utils.js';

describe('requireNonEmpty', () => {
	it('returns the value when non-empty', () => {
		expect(requireNonEmpty('MY_VAR', 'hello')).toBe('hello');
	});

	it('throws when value is empty string', () => {
		expect(() => requireNonEmpty('MY_VAR', '')).toThrow('MY_VAR environment variable is required');
	});

	it('throws when value is only whitespace', () => {
		expect(() => requireNonEmpty('MY_VAR', '   ')).toThrow('MY_VAR environment variable is required');
	});

	it('includes variable name in error', () => {
		expect(() => requireNonEmpty('DATABASE_URL', ''))
			.toThrow('DATABASE_URL environment variable is required');
	});
});
