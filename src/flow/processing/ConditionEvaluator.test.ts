/**
 * Condition Evaluator Tests
 */

import { describe, it, expect } from 'vitest';
import { ConditionEvaluator } from './ConditionEvaluator.js';

describe('ConditionEvaluator', () => {
  const evaluator = new ConditionEvaluator();

  describe('Simple comparisons', () => {
    it('should evaluate equality comparison', () => {
      const context = {
        output: { value: 'test' },
      };

      const result = evaluator.evaluate(
        "output.value === 'test'",
        context,
        'test-step'
      );

      expect(result).toBe(true);
    });

    it('should evaluate inequality comparison', () => {
      const context = {
        output: { value: 'test' },
      };

      const result = evaluator.evaluate(
        "output.value !== 'other'",
        context,
        'test-step'
      );

      expect(result).toBe(true);
    });

    it('should evaluate numeric comparisons', () => {
      const context = {
        output: { count: 10 },
      };

      expect(evaluator.evaluate('output.count > 5', context, 'test-step')).toBe(
        true
      );
      expect(evaluator.evaluate('output.count < 5', context, 'test-step')).toBe(
        false
      );
      expect(evaluator.evaluate('output.count >= 10', context, 'test-step')).toBe(
        true
      );
      expect(evaluator.evaluate('output.count <= 10', context, 'test-step')).toBe(
        true
      );
    });
  });

  describe('Boolean logic', () => {
    it('should evaluate AND operator', () => {
      const context = {
        output: { a: true, b: true },
      };

      expect(
        evaluator.evaluate('output.a && output.b', context, 'test-step')
      ).toBe(true);
      expect(
        evaluator.evaluate('output.a && !output.b', context, 'test-step')
      ).toBe(false);
    });

    it('should evaluate OR operator', () => {
      const context = {
        output: { a: true, b: false },
      };

      expect(
        evaluator.evaluate('output.a || output.b', context, 'test-step')
      ).toBe(true);
      expect(
        evaluator.evaluate('!output.a && !output.b', context, 'test-step')
      ).toBe(false);
    });

    it('should evaluate NOT operator', () => {
      const context = {
        output: { flag: false },
      };

      expect(evaluator.evaluate('!output.flag', context, 'test-step')).toBe(
        true
      );
    });
  });

  describe('Nested property access', () => {
    it('should access nested properties', () => {
      const context = {
        output: { data: { status: 'success', code: 200 } },
      };

      expect(
        evaluator.evaluate("output.data.status === 'success'", context, 'test-step')
      ).toBe(true);
      expect(
        evaluator.evaluate('output.data.code === 200', context, 'test-step')
      ).toBe(true);
    });
  });

  describe('Task metadata access', () => {
    it('should access task metadata', () => {
      const context = {
        output: {},
        task: { priority: 'high' },
      };

      expect(
        evaluator.evaluate("task.priority === 'high'", context, 'test-step')
      ).toBe(true);
    });

    it('should combine output and task', () => {
      const context = {
        output: { complexity: 'high' },
        task: { priority: 'high' },
      };

      expect(
        evaluator.evaluate(
          "output.complexity === 'high' && task.priority === 'high'",
          context,
          'test-step'
        )
      ).toBe(true);
    });
  });

  describe('Inputs access', () => {
    it('should access input variables', () => {
      const context = {
        output: {},
        inputs: { threshold: 10 },
      };

      expect(
        evaluator.evaluate('inputs.threshold > 5', context, 'test-step')
      ).toBe(true);
    });
  });

  describe('Complex conditions', () => {
    it('should evaluate complex boolean expressions', () => {
      const context = {
        output: { exitCode: 0, hasErrors: false, warnings: 2 },
      };

      const result = evaluator.evaluate(
        'output.exitCode === 0 && !output.hasErrors && output.warnings < 5',
        context,
        'test-step'
      );

      expect(result).toBe(true);
    });

    it('should handle parentheses', () => {
      const context = {
        output: { a: true, b: false, c: true },
      };

      expect(
        evaluator.evaluate(
          '(output.a || output.b) && output.c',
          context,
          'test-step'
        )
      ).toBe(true);
    });
  });

  describe('evaluateConditions', () => {
    it('should return first matching condition', () => {
      const conditions = [
        { when: 'output.value > 10', goto: 'high' },
        { when: 'output.value > 5', goto: 'medium' },
        { when: 'output.value > 0', goto: 'low' },
      ];

      const context = { output: { value: 7 } };

      const result = evaluator.evaluateConditions(conditions, context, 'test-step');

      expect(result).toBe('medium');
    });

    it('should return undefined if no conditions match', () => {
      const conditions = [
        { when: 'output.value > 10', goto: 'high' },
        { when: 'output.value < 0', goto: 'negative' },
      ];

      const context = { output: { value: 5 } };

      const result = evaluator.evaluateConditions(conditions, context, 'test-step');

      expect(result).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw on non-boolean result', () => {
      const context = { output: { value: 'test' } };

      expect(() => {
        evaluator.evaluate('output.value', context, 'test-step');
      }).toThrow();
    });

    it('should throw on syntax error', () => {
      const context = { output: {} };

      expect(() => {
        evaluator.evaluate('invalid syntax !!!', context, 'test-step');
      }).toThrow();
    });

    it('should throw on undefined property access', () => {
      const context = { output: {} };

      expect(() => {
        evaluator.evaluate('output.missing.property', context, 'test-step');
      }).toThrow();
    });
  });

  describe('isValid', () => {
    it('should validate correct syntax', () => {
      expect(evaluator.isValid("output.value === 'test'")).toBe(true);
      expect(evaluator.isValid('output.count > 5')).toBe(true);
      expect(evaluator.isValid('output.a && output.b')).toBe(true);
    });

    it('should reject invalid syntax', () => {
      expect(evaluator.isValid('invalid syntax')).toBe(false);
      expect(evaluator.isValid('output.')).toBe(false);
      expect(evaluator.isValid('')).toBe(false);
    });
  });
});
