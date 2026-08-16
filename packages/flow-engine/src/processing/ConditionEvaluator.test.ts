/**
 * Condition Evaluator Tests
 */
import { describe, expect, it } from 'vitest';

import { ConditionEvaluator } from './ConditionEvaluator';

describe('ConditionEvaluator', () => {
	const evaluator = new ConditionEvaluator();

	describe('outputs access (keyed by step id)', () => {
		it('evaluates equality on a dep step output', () => {
			const context = {
				outputs: { 'step-a': { value: 'test' } },
			};
			expect(evaluator.evaluate("outputs['step-a'].value === 'test'", context, 'test-step')).toBe(true);
		});

		it('evaluates inequality comparison', () => {
			const context = {
				outputs: { 'step-a': { value: 'test' } },
			};
			expect(evaluator.evaluate("outputs['step-a'].value !== 'other'", context, 'test-step')).toBe(true);
		});

		it('evaluates numeric comparisons', () => {
			const context = {
				outputs: { counter: { count: 10 } },
			};
			expect(evaluator.evaluate("outputs.counter.count > 5", context, 'test-step')).toBe(true);
			expect(evaluator.evaluate("outputs.counter.count < 5", context, 'test-step')).toBe(false);
			expect(evaluator.evaluate("outputs.counter.count >= 10", context, 'test-step')).toBe(true);
		});
	});

	describe('Boolean logic', () => {
		it('evaluates AND operator', () => {
			const context = {
				outputs: { s: { a: true, b: true } },
			};
			expect(evaluator.evaluate('outputs.s.a && outputs.s.b', context, 'test-step')).toBe(true);
			expect(evaluator.evaluate('outputs.s.a && !outputs.s.b', context, 'test-step')).toBe(false);
		});

		it('evaluates OR operator', () => {
			const context = {
				outputs: { s: { a: true, b: false } },
			};
			expect(evaluator.evaluate('outputs.s.a || outputs.s.b', context, 'test-step')).toBe(true);
		});

		it('evaluates NOT operator', () => {
			const context = {
				outputs: { s: { flag: false } },
			};
			expect(evaluator.evaluate('!outputs.s.flag', context, 'test-step')).toBe(true);
		});
	});

	describe('Inputs access', () => {
		it('accesses input variables', () => {
			const context = {
				outputs: {},
				inputs: { threshold: 10 },
			};
			expect(evaluator.evaluate('inputs.threshold > 5', context, 'test-step')).toBe(true);
		});
	});

	describe('Complex conditions', () => {
		it('evaluates complex boolean expressions', () => {
			const context = {
				outputs: { build: { exitCode: 0, hasErrors: false, warnings: 2 } },
			};
			expect(
				evaluator.evaluate(
					'outputs.build.exitCode === 0 && !outputs.build.hasErrors && outputs.build.warnings < 5',
					context,
					'test-step'
				)
			).toBe(true);
		});

		it('handles parentheses', () => {
			const context = {
				outputs: { s: { a: true, b: false, c: true } },
			};
			expect(evaluator.evaluate('(outputs.s.a || outputs.s.b) && outputs.s.c', context, 'test-step')).toBe(true);
		});
	});

	describe('evaluateConditions', () => {
		it('returns first matching condition', () => {
			const conditions = [
				{ when: 'outputs.s.value > 10', goto: 'high' },
				{ when: 'outputs.s.value > 5', goto: 'medium' },
				{ when: 'outputs.s.value > 0', goto: 'low' },
			];
			const context = { outputs: { s: { value: 7 } } };
			expect(evaluator.evaluateConditions(conditions, context, 'test-step')).toBe('medium');
		});

		it('returns undefined if no conditions match', () => {
			const conditions = [
				{ when: 'outputs.s.value > 10', goto: 'high' },
				{ when: 'outputs.s.value < 0', goto: 'negative' },
			];
			const context = { outputs: { s: { value: 5 } } };
			expect(evaluator.evaluateConditions(conditions, context, 'test-step')).toBeUndefined();
		});
	});

	describe('Error handling', () => {
		it('throws on non-boolean result', () => {
			const context = { outputs: { s: { value: 'test' } } };
			expect(() => evaluator.evaluate("outputs.s.value", context, 'test-step')).toThrow();
		});

		it('throws on syntax error', () => {
			const context = { outputs: {} };
			expect(() => evaluator.evaluate('invalid syntax !!!', context, 'test-step')).toThrow();
		});
	});

	describe('isValid', () => {
		it('validates correct syntax', () => {
			expect(evaluator.isValid("outputs.s.value === 'test'")).toBe(true);
			expect(evaluator.isValid('outputs.s.count > 5')).toBe(true);
		});

		it('rejects invalid syntax', () => {
			expect(evaluator.isValid('invalid syntax')).toBe(false);
			expect(evaluator.isValid('outputs.')).toBe(false);
			expect(evaluator.isValid('')).toBe(false);
		});
	});
});
