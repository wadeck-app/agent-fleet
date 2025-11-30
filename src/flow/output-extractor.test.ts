/**
 * Output Extractor Tests
 */

import { describe, it, expect } from 'vitest';
import { OutputExtractor } from './output-extractor.js';
import type { StepOutput } from './types.js';

describe('OutputExtractor', () => {
  const extractor = new OutputExtractor();

  describe('Basic extraction', () => {
    it('should extract entire output when no pattern specified', () => {
      const config: StepOutput = {
        result: { type: 'string' },
      };

      const output = extractor.extract('Hello World', config, 'test-step');

      expect(output.result).toBe('Hello World');
    });

    it('should use additionalContext values', () => {
      const config: StepOutput = {
        exitCode: { type: 'number' },
      };

      const output = extractor.extract('output', config, 'test-step', {
        exitCode: 42,
      });

      expect(output.exitCode).toBe(42);
    });

    it('should return raw output when no config', () => {
      const output = extractor.extract('test output', undefined, 'test-step', {
        exitCode: 0,
      });

      expect(output.rawOutput).toBe('test output');
      expect(output.exitCode).toBe(0);
    });
  });

  describe('Pattern extraction', () => {
    it('should extract value using regex pattern', () => {
      const config: StepOutput = {
        version: { type: 'string', pattern: 'version: (\\d+\\.\\d+\\.\\d+)' },
      };

      const output = extractor.extract(
        'The version: 1.2.3 is available',
        config,
        'test-step'
      );

      expect(output.version).toBe('1.2.3');
    });

    it('should extract first match when pattern matches multiple times', () => {
      const config: StepOutput = {
        first: { type: 'string', pattern: 'value: (\\w+)' },
      };

      const output = extractor.extract(
        'value: first\nvalue: second',
        config,
        'test-step'
      );

      expect(output.first).toBe('first');
    });

    it('should use entire match when no capturing group', () => {
      const config: StepOutput = {
        match: { type: 'string', pattern: 'ERROR.*' },
      };

      const output = extractor.extract(
        'Some text\nERROR something bad\nMore text',
        config,
        'test-step'
      );

      expect(output.match).toContain('ERROR');
    });
  });

  describe('Type conversion', () => {
    it('should convert string to number', () => {
      const config: StepOutput = {
        count: { type: 'number' },
      };

      const output = extractor.extract('42', config, 'test-step');

      expect(output.count).toBe(42);
      expect(typeof output.count).toBe('number');
    });

    it('should convert string to boolean', () => {
      const config: StepOutput = {
        flag: { type: 'boolean' },
      };

      const output = extractor.extract('true', config, 'test-step');

      expect(output.flag).toBe(true);
      expect(typeof output.flag).toBe('boolean');
    });
  });

  describe('Transform functions', () => {
    it('should parse JSON', () => {
      const config: StepOutput = {
        data: { type: 'object', transform: 'parseJSON' },
      };

      const output = extractor.extract(
        '{"name":"test","value":123}',
        config,
        'test-step'
      );

      expect(output.data).toEqual({ name: 'test', value: 123 });
    });

    it('should parseInt', () => {
      const config: StepOutput = {
        number: { type: 'number', transform: 'parseInt' },
      };

      const output = extractor.extract('42.7', config, 'test-step');

      expect(output.number).toBe(42);
    });

    it('should parseFloat', () => {
      const config: StepOutput = {
        decimal: { type: 'number', transform: 'parseFloat' },
      };

      const output = extractor.extract('3.14159', config, 'test-step');

      expect(output.decimal).toBeCloseTo(3.14159);
    });

    it('should parseBoolean', () => {
      const config: StepOutput = {
        yes: { type: 'boolean', transform: 'parseBoolean' },
        no: { type: 'boolean', transform: 'parseBoolean' },
      };

      const output1 = extractor.extract('yes', { yes: config.yes }, 'test-step');
      const output2 = extractor.extract('no', { no: config.no }, 'test-step');

      expect(output1.yes).toBe(true);
      expect(output2.no).toBe(false);
    });

    it('should trim strings', () => {
      const config: StepOutput = {
        clean: { type: 'string', transform: 'trim' },
      };

      const output = extractor.extract('  spaces  ', config, 'test-step');

      expect(output.clean).toBe('spaces');
    });

    it('should toLowerCase', () => {
      const config: StepOutput = {
        lower: { type: 'string', transform: 'toLowerCase' },
      };

      const output = extractor.extract('UPPER', config, 'test-step');

      expect(output.lower).toBe('upper');
    });

    it('should toUpperCase', () => {
      const config: StepOutput = {
        upper: { type: 'string', transform: 'toUpperCase' },
      };

      const output = extractor.extract('lower', config, 'test-step');

      expect(output.upper).toBe('LOWER');
    });

    it('should split by lines', () => {
      const config: StepOutput = {
        lines: { type: 'object', transform: 'split' },
      };

      const output = extractor.extract(
        'line1\nline2\n\nline3',
        config,
        'test-step'
      );

      expect(output.lines).toEqual(['line1', 'line2', 'line3']);
    });
  });

  describe('Default values', () => {
    it('should use default when extraction fails', () => {
      const config: StepOutput = {
        missing: { type: 'string', pattern: 'notfound', default: 'default-value' },
      };

      const output = extractor.extract('some text', config, 'test-step');

      expect(output.missing).toBe('default-value');
    });

    it('should skip optional fields without default', () => {
      const config: StepOutput = {
        optional: { type: 'string', pattern: 'notfound', required: false },
      };

      const output = extractor.extract('some text', config, 'test-step');

      expect(output.optional).toBeUndefined();
    });
  });

  describe('Required fields', () => {
    it('should throw error for missing required field', () => {
      const config: StepOutput = {
        required: { type: 'string', pattern: 'notfound', required: true },
      };

      expect(() => {
        extractor.extract('some text', config, 'test-step');
      }).toThrow();
    });
  });

  describe('Combined features', () => {
    it('should extract, transform, and convert type', () => {
      const config: StepOutput = {
        count: {
          type: 'number',
          pattern: 'Count: (\\d+)',
          transform: 'parseInt',
        },
      };

      const output = extractor.extract('Count: 42', config, 'test-step');

      expect(output.count).toBe(42);
      expect(typeof output.count).toBe('number');
    });

    it('should handle multiple outputs with different configs', () => {
      const config: StepOutput = {
        exitCode: { type: 'number' },
        version: { type: 'string', pattern: 'v(\\S+)', transform: 'trim' },
        data: { type: 'object', pattern: '\\{.*\\}', transform: 'parseJSON' },
      };

      const output = extractor.extract(
        'Version v1.2.3\n{"key":"value"}',
        config,
        'test-step',
        { exitCode: 0 }
      );

      expect(output.exitCode).toBe(0);
      expect(output.version).toBe('1.2.3');
      expect(output.data).toEqual({ key: 'value' });
    });
  });
});
