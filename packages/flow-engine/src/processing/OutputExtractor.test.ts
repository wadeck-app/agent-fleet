/**
 * Output Extractor Tests
 */
import { describe, expect, it } from 'vitest';

import { OutputExtractor } from '../processing/OutputExtractor';
import type { StepOutput } from '../types';

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

			const output = extractor.extract('The version: 1.2.3 is available', config, 'test-step');

			expect(output.version).toBe('1.2.3');
		});

		it('should extract first match when pattern matches multiple times', () => {
			const config: StepOutput = {
				first: { type: 'string', pattern: 'value: (\\w+)' },
			};

			const output = extractor.extract('value: first\nvalue: second', config, 'test-step');

			expect(output.first).toBe('first');
		});

		it('should use entire match when no capturing group', () => {
			const config: StepOutput = {
				match: { type: 'string', pattern: 'ERROR.*' },
			};

			const output = extractor.extract('Some text\nERROR something bad\nMore text', config, 'test-step');

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

			const output = extractor.extract('{"name":"test","value":123}', config, 'test-step');

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

			const output = extractor.extract('line1\nline2\n\nline3', config, 'test-step');

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

	describe('New type conversions', () => {
		it('should convert to integer with rounding', () => {
			const config: StepOutput = {
				rounded: { type: 'integer' },
			};

			const output = extractor.extract('42.7', config, 'test-step');

			expect(output.rounded).toBe(43);
			expect(typeof output.rounded).toBe('number');
		});

		it('should convert to percentage', () => {
			const config: StepOutput = {
				percent: { type: 'percentage' },
			};

			const output = extractor.extract('85.5', config, 'test-step');

			expect(output.percent).toBe(85.5);
			expect(typeof output.percent).toBe('number');
		});

		it('should convert to duration', () => {
			const config: StepOutput = {
				duration: { type: 'duration' },
			};

			const output = extractor.extract('3600', config, 'test-step');

			expect(output.duration).toBe(3600);
			expect(typeof output.duration).toBe('number');
		});

		it('should handle text type as string', () => {
			const config: StepOutput = {
				content: { type: 'text' },
			};

			const output = extractor.extract('Multi-line\ntext content', config, 'test-step');

			expect(output.content).toBe('Multi-line\ntext content');
			expect(typeof output.content).toBe('string');
		});

		it('should handle url type as string', () => {
			const config: StepOutput = {
				link: { type: 'url' },
			};

			const output = extractor.extract('https://example.com', config, 'test-step');

			expect(output.link).toBe('https://example.com');
			expect(typeof output.link).toBe('string');
		});

		it('should handle markdown type as string', () => {
			const config: StepOutput = {
				doc: { type: 'markdown' },
			};

			const output = extractor.extract('# Title\n\n**Bold**', config, 'test-step');

			expect(output.doc).toBe('# Title\n\n**Bold**');
			expect(typeof output.doc).toBe('string');
		});

		it('should handle regex type as string', () => {
			const config: StepOutput = {
				pattern: { type: 'regex' },
			};

			const output = extractor.extract('^[a-z]+$', config, 'test-step');

			expect(output.pattern).toBe('^[a-z]+$');
			expect(typeof output.pattern).toBe('string');
		});

		it('should handle password type as string', () => {
			const config: StepOutput = {
				secret: { type: 'password' },
			};

			const output = extractor.extract('secretpass123', config, 'test-step');

			expect(output.secret).toBe('secretpass123');
			expect(typeof output.secret).toBe('string');
		});

		it('should handle enum type as-is', () => {
			const config: StepOutput = {
				status: { type: 'enum' },
			};

			const output = extractor.extract('active', config, 'test-step');

			expect(output.status).toBe('active');
		});

		it('should handle multi-enum type as-is', () => {
			const config: StepOutput = {
				tags: { type: 'multi-enum' },
			};

			const output = extractor.extract('["tag1", "tag2"]', config, 'test-step');

			expect(output.tags).toBe('["tag1", "tag2"]');
		});

		it('should handle priority type as-is', () => {
			const config: StepOutput = {
				priority: { type: 'priority' },
			};

			const output = extractor.extract('high', config, 'test-step');

			expect(output.priority).toBe('high');
		});

		it('should handle file type as string path', () => {
			const config: StepOutput = {
				path: { type: 'file' },
			};

			const output = extractor.extract('/path/to/file.txt', config, 'test-step');

			expect(output.path).toBe('/path/to/file.txt');
			expect(typeof output.path).toBe('string');
		});

		it('should handle folder type as string path', () => {
			const config: StepOutput = {
				dir: { type: 'folder' },
			};

			const output = extractor.extract('/path/to/directory', config, 'test-step');

			expect(output.dir).toBe('/path/to/directory');
			expect(typeof output.dir).toBe('string');
		});

		it('should handle date type as ISO string', () => {
			const config: StepOutput = {
				created: { type: 'date' },
			};

			const output = extractor.extract('2024-01-23', config, 'test-step');

			expect(output.created).toBe('2024-01-23');
			expect(typeof output.created).toBe('string');
		});

		it('should handle datetime type as ISO string', () => {
			const config: StepOutput = {
				timestamp: { type: 'datetime' },
			};

			const output = extractor.extract('2024-01-23T10:30:00Z', config, 'test-step');

			expect(output.timestamp).toBe('2024-01-23T10:30:00Z');
			expect(typeof output.timestamp).toBe('string');
		});

		it('should parse array type from JSON string', () => {
			const config: StepOutput = {
				items: { type: 'array' },
			};

			const output = extractor.extract('["item1", "item2", "item3"]', config, 'test-step');

			expect(output.items).toEqual(['item1', 'item2', 'item3']);
			expect(Array.isArray(output.items)).toBe(true);
		});

		it('should parse keyvalue type from JSON string', () => {
			const config: StepOutput = {
				config: { type: 'keyvalue' },
			};

			const output = extractor.extract('{"key1":"value1","key2":"value2"}', config, 'test-step');

			expect(output.config).toEqual({ key1: 'value1', key2: 'value2' });
			expect(typeof output.config).toBe('object');
		});

		it('should keep array type as-is when already parsed', () => {
			const config: StepOutput = {
				items: { type: 'array' },
			};

			const output = extractor.extract('ignored', config, 'test-step', {
				items: ['a', 'b', 'c'],
			});

			expect(output.items).toEqual(['a', 'b', 'c']);
		});

		it('should keep keyvalue type as-is when already object', () => {
			const config: StepOutput = {
				metadata: { type: 'keyvalue' },
			};

			const output = extractor.extract('ignored', config, 'test-step', {
				metadata: { foo: 'bar' },
			});

			expect(output.metadata).toEqual({ foo: 'bar' });
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

			const output = extractor.extract('Version v1.2.3\n{"key":"value"}', config, 'test-step', { exitCode: 0 });

			expect(output.exitCode).toBe(0);
			expect(output.version).toBe('1.2.3');
			expect(output.data).toEqual({ key: 'value' });
		});
	});

	describe('JSONPath extraction', () => {
		it('extracts top-level field via $.field', () => {
			const config: StepOutput = {
				status: { type: 'string', jsonpath: '$.status' },
			};
			const output = extractor.extract('{"status":"todo","id":"t1"}', config, 'step1');
			expect(output.status).toBe('todo');
		});

		it('extracts nested field via $.field.nested', () => {
			const config: StepOutput = {
				value: { type: 'string', jsonpath: '$.nested.value' },
			};
			const output = extractor.extract('{"nested":{"value":"deep"}}', config, 'step1');
			expect(output.value).toBe('deep');
		});

		it('throws OutputExtractionError on invalid JSON', () => {
			const config: StepOutput = {
				status: { type: 'string', jsonpath: '$.status', required: true },
			};
			expect(() => extractor.extract('not-json', config, 'step1')).toThrow(/JSON/);
		});

		it('throws OutputExtractionError when path is missing in parsed JSON', () => {
			const config: StepOutput = {
				status: { type: 'string', jsonpath: '$.status', required: true },
			};
			expect(() => extractor.extract('{"other":"value"}', config, 'step1')).toThrow(/status/);
		});

		it('throws when both jsonpath and pattern are set', () => {
			const config: StepOutput = {
				status: { type: 'string', jsonpath: '$.status', pattern: 'status: (\\w+)', required: true },
			};
			expect(() => extractor.extract('{"status":"todo"}', config, 'step1')).toThrow(/mutually exclusive/);
		});

		it('extracts array element via bracket notation ($.tags[0])', () => {
			const config: StepOutput = {
				first: { type: 'string', jsonpath: '$.tags[0]' },
			};
			const output = extractor.extract('{"tags":["alpha","beta"]}', config, 'step1');
			expect(output.first).toBe('alpha');
		});

		it('extracts nested array element via bracket notation ($.items[1].name)', () => {
			const config: StepOutput = {
				name: { type: 'string', jsonpath: '$.items[1].name' },
			};
			const output = extractor.extract('{"items":[{"name":"first"},{"name":"second"}]}', config, 'step1');
			expect(output.name).toBe('second');
		});

		it('extracts array element via dot notation ($.tags.0)', () => {
			const config: StepOutput = {
				first: { type: 'string', jsonpath: '$.tags.0' },
			};
			const output = extractor.extract('{"tags":["alpha","beta"]}', config, 'step1');
			expect(output.first).toBe('alpha');
		});
	});

	describe('Transform: parseYAML', () => {
		it('parses a simple YAML key-value string into an object', () => {
			const config: StepOutput = {
				data: { type: 'object', transform: 'parseYAML' },
			};
			const output = extractor.extract('key: value\ncount: 42', config, 'step1');
			expect(output.data).toEqual({ key: 'value', count: 42 });
		});

		it('parses a YAML list', () => {
			const config: StepOutput = {
				items: { type: 'object', transform: 'parseYAML' },
			};
			const output = extractor.extract('- alpha\n- beta\n- gamma', config, 'step1');
			expect(output.items).toEqual(['alpha', 'beta', 'gamma']);
		});

		it('throws on invalid YAML', () => {
			const config: StepOutput = {
				data: { type: 'object', transform: 'parseYAML', required: true },
			};
			expect(() => extractor.extract('key: [unclosed', config, 'step1')).toThrow();
		});
	});

	describe('From path extraction (intervention output)', () => {
		it('extracts intervention.approved boolean via from path', () => {
			const config: StepOutput = {
				approved: { type: 'boolean', from: 'intervention.approved' },
			};
			const output = extractor.extract('', config, 'step1', {
				intervention: { approved: true, comment: 'looks good', answeredBy: 'user1' },
			});
			expect(output.approved).toBe(true);
		});

		it('extracts intervention.value string via from path', () => {
			const config: StepOutput = {
				answer: { type: 'string', from: 'intervention.value' },
			};
			const output = extractor.extract('', config, 'step1', {
				intervention: { value: 'my answer', answeredBy: 'user1' },
			});
			expect(output.answer).toBe('my answer');
		});

		it('extracts intervention.answeredBy string via from path', () => {
			const config: StepOutput = {
				respondent: { type: 'string', from: 'intervention.answeredBy' },
			};
			const output = extractor.extract('', config, 'step1', {
				intervention: { approved: false, answeredBy: 'alice' },
			});
			expect(output.respondent).toBe('alice');
		});

		it('throws when from path does not exist in context', () => {
			const config: StepOutput = {
				missing: { type: 'string', from: 'intervention.nonexistent', required: true },
			};
			expect(() =>
				extractor.extract('', config, 'step1', {
					intervention: { approved: true },
				})
			).toThrow(/nonexistent/);
		});

		it('throws when no additionalContext is provided and from is specified', () => {
			const config: StepOutput = {
				approved: { type: 'boolean', from: 'intervention.approved', required: true },
			};
			expect(() => extractor.extract('', config, 'step1')).toThrow(/no context available/);
		});
	});
});
