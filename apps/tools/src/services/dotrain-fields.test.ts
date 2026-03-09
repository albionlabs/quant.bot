import { describe, it, expect } from 'vitest';
import { parseDotrainYaml } from './dotrain-fields.js';

const SAMPLE_DOTRAIN = `
orders:
  base:
    orderbook: base
    inputs:
      - token: input
    outputs:
      - token: output

deployments:
  base:
    order: base
    scenario: some-scenario

gui:
  name: Test Strategy
  description: A test strategy description.

  deployments:
    base:
      name: Base deployment
      description: The base deployment.
      deposits:
        - token: output
      fields:
        - binding: oracle-timeout
          name: Oracle timeout
          description: Max staleness in seconds.
          default: 300
        - binding: amount-per-epoch
          name: Budget per period
          description: How much to spend.
      select-tokens:
        - key: output
          name: Token to Sell
          description: Select the token to sell
        - key: input
          name: Token to Buy
          description: Select the token to buy

    base-inv:
      name: Inverse deployment
      description: The inverse deployment.
      deposits:
        - token: output
      fields:
        - binding: oracle-timeout
          name: Oracle timeout
          description: Max staleness in seconds.
          default: 300
      select-tokens:
        - key: output
          name: Token to Sell
          description: Select the token to sell

---
#oracle-timeout !Max staleness.
#amount-per-epoch !Budget.

#calculate-io
using-words-from some-subparser
:;
`;

describe('parseDotrainYaml', () => {
	it('extracts gui metadata from dotrain source', () => {
		const result = parseDotrainYaml(SAMPLE_DOTRAIN);
		expect(result).not.toBeNull();
		expect(result!.name).toBe('Test Strategy');
		expect(result!.description).toBe('A test strategy description.');
	});

	it('extracts deployments with fields', () => {
		const result = parseDotrainYaml(SAMPLE_DOTRAIN)!;
		expect(result.deployments).toHaveLength(2);

		const base = result.deployments.find((d) => d.key === 'base')!;
		expect(base.name).toBe('Base deployment');
		expect(Object.keys(base.fields)).toEqual(['oracle-timeout', 'amount-per-epoch']);
		expect(base.fields['oracle-timeout']).toEqual({
			name: 'Oracle timeout',
			description: 'Max staleness in seconds.',
			default: '300'
		});
		expect(base.fields['amount-per-epoch']).toEqual({
			name: 'Budget per period',
			description: 'How much to spend.'
		});
	});

	it('extracts select-tokens', () => {
		const result = parseDotrainYaml(SAMPLE_DOTRAIN)!;
		const base = result.deployments.find((d) => d.key === 'base')!;
		expect(Object.keys(base.selectTokens)).toEqual(['output', 'input']);
		expect(base.selectTokens['output']).toEqual({
			name: 'Token to Sell',
			description: 'Select the token to sell'
		});
	});

	it('extracts deposits', () => {
		const result = parseDotrainYaml(SAMPLE_DOTRAIN)!;
		const base = result.deployments.find((d) => d.key === 'base')!;
		expect(base.deposits).toEqual(['output']);
	});

	it('returns null for invalid yaml', () => {
		expect(parseDotrainYaml('not: [valid: yaml: {')).toBeNull();
	});

	it('returns null when no gui section exists', () => {
		expect(parseDotrainYaml('orders:\n  base:\n    orderbook: base\n---\n#code')).toBeNull();
	});

	it('handles source without --- separator', () => {
		const yamlOnly = `gui:\n  name: Minimal\n  description: No code.\n  deployments: {}`;
		const result = parseDotrainYaml(yamlOnly);
		expect(result).not.toBeNull();
		expect(result!.name).toBe('Minimal');
		expect(result!.deployments).toHaveLength(0);
	});
});
