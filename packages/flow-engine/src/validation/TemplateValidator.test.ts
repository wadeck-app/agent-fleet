/**
 * TemplateValidator Tests
 *
 * Tests for template expression validation:
 * - Variable reference extraction
 * - Input reference validation
 * - Step reference validation
 * - Task metadata validation
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { TemplateValidator } from './TemplateValidator';
import { ValidationCode } from './ValidationTypes';

describe('TemplateValidator', () => {
	let validator: TemplateValidator;
	let issueCollector: MockIssueCollector;

	beforeEach(() => {
		issueCollector = new MockIssueCollector();
		validator = new TemplateValidator(issueCollector);
	});

	describe('validateTemplates', () => {
		it('should validate input references', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {
					username: 'string',
				},
				steps: [
					{
						id: 'greet',
						name: 'Greet',
						type: 'model',
						model: 'sonnet',
						prompt: 'Hello ${{ inputs.username }}!',
					},
				],
			};

			const stepIds = new Set(['greet']);
			const inputNames = new Set(['username']);

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should detect undefined input references', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {
					username: 'string',
				},
				steps: [
					{
						id: 'greet',
						name: 'Greet',
						type: 'model',
						model: 'sonnet',
						prompt: 'Hello ${{ inputs.unknown }}!',
					},
				],
			};

			const stepIds = new Set(['greet']);
			const inputNames = new Set(['username']);

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(1);
			expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_INPUT);
			expect(issueCollector.issues[0].severity).toBe('error');
			expect(issueCollector.issues[0].message).toContain('undefined input');
		});

		it('should validate step references', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: 'First step',
					},
					{
						id: 'step2',
						name: 'Step 2',
						type: 'model',
						model: 'sonnet',
						prompt: 'Using ${{ steps.step1.outputs.result }}',
					},
				],
			};

			const stepIds = new Set(['step1', 'step2']);
			const inputNames = new Set<string>();

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should detect undefined step references', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: 'Using ${{ steps.unknown.outputs.result }}',
					},
				],
			};

			const stepIds = new Set(['step1']);
			const inputNames = new Set<string>();

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(1);
			expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_STEP);
			expect(issueCollector.issues[0].severity).toBe('error');
			expect(issueCollector.issues[0].message).toContain('undefined step');
		});

		it('should validate task metadata references', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: 'Task priority: ${{ task.priority }}',
					},
				],
			};

			const stepIds = new Set(['step1']);
			const inputNames = new Set<string>();

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should warn about unknown task fields', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: 'Task: ${{ task.unknownField }}',
					},
				],
			};

			const stepIds = new Set(['step1']);
			const inputNames = new Set<string>();

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(1);
			expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_VARIABLE);
			expect(issueCollector.issues[0].severity).toBe('warning');
			expect(issueCollector.issues[0].message).toContain('undefined task field');
		});

		it('should handle multiple template expressions', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {
					name: 'string',
					age: 'number',
				},
				steps: [
					{
						id: 'greet',
						name: 'Greet',
						type: 'model',
						model: 'sonnet',
						prompt: 'Hello ${{ inputs.name }}, you are ${{ inputs.age }} years old',
					},
				],
			};

			const stepIds = new Set(['greet']);
			const inputNames = new Set(['name', 'age']);

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should validate templates in script steps', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {
					command: 'string',
				},
				steps: [
					{
						id: 'run',
						name: 'Run Command',
						type: 'script',
						script: 'echo ${{ inputs.command }}',
					},
				],
			};

			const stepIds = new Set(['run']);
			const inputNames = new Set(['command']);

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should handle steps with no templates', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'greet',
						name: 'Greet',
						type: 'model',
						model: 'sonnet',
						prompt: 'Hello World',
					},
				],
			};

			const stepIds = new Set(['greet']);
			const inputNames = new Set<string>();

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});

		it('should not leak auto-discovered inputs between successive validations (regression)', () => {
			// Flow A references an undeclared input "extra_param"
			const flowA: FlowDefinition = {
				id: 'flow-a',
				version: '1.0.0',
				name: 'Flow A',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: '${{ inputs.extra_param }}',
					},
				],
			};

			// Flow B only uses its own declared input "task"
			const flowB: FlowDefinition = {
				id: 'flow-b',
				version: '1.0.0',
				name: 'Flow B',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: { task: 'string' },
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'model',
						model: 'sonnet',
						prompt: '${{ inputs.task }}',
					},
				],
			};

			// Validate flow A first — "extra_param" gets auto-discovered
			validator.validateTemplates(flowA, new Set(['step1']), new Set<string>());
			const autoAfterA = validator.getAutoDiscoveredInputs();
			expect(autoAfterA.has('extra_param')).toBe(true);

			// Validate flow B — auto-discovered inputs should reset, "extra_param" must NOT leak
			validator.validateTemplates(flowB, new Set(['step1']), new Set(['task']));
			const autoAfterB = validator.getAutoDiscoveredInputs();
			expect(autoAfterB.has('extra_param')).toBe(false);
			expect(autoAfterB.size).toBe(0);
		});

		it('should handle whitespace in template expressions', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {
					name: 'string',
				},
				steps: [
					{
						id: 'greet',
						name: 'Greet',
						type: 'model',
						model: 'sonnet',
						prompt: 'Hello ${{   inputs.name   }}!',
					},
				],
			};

			const stepIds = new Set(['greet']);
			const inputNames = new Set(['name']);

			validator.validateTemplates(flow, stepIds, inputNames);

			expect(issueCollector.issues).toHaveLength(0);
		});
	});
});
