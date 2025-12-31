import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { DependencyOrderValidator } from './DependencyOrderValidator';
import { ValidationCode, type ValidationIssue } from './ValidationTypes';

/**
 * Mock IssueCollector for testing
 */
class MockIssueCollector {
	public issues: ValidationIssue[] = [];

	addIssue(issue: ValidationIssue): void {
		this.issues.push(issue);
	}

	reset(): void {
		this.issues = [];
	}
}

describe('DependencyOrderValidator', () => {
	const createFlow = (steps: FlowDefinition['steps']): FlowDefinition => ({
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test Flow',
		description: '',
		workspace: {
			mode: 'isolated',
			gitStrategy: 'main-only',
			reusePolicy: 'always',
		},
		inputs: {},
		steps,
	});

	describe('Direct Dependencies', () => {
		it('should allow variable usage when step has direct dependency', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate something',
					output: { response: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step2',
					name: 'Step 2',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.response }}',
					depends: ['step1'], // ✅ Has dependency
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});

		it('should error when variable used without dependency', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate something',
					output: { response: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step2',
					name: 'Step 2',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.response }}',
					// ❌ No depends array
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0]).toMatchObject({
				severity: 'error',
				code: ValidationCode.UNDEFINED_VARIABLE,
				message: expect.stringContaining('does not depend on it'),
				location: { stepId: 'step2', field: 'prompt' },
			});
			expect(collector.issues[0].suggestion).toContain("Add 'step1' to the 'depends' array");
		});
	});

	describe('Transitive Dependencies', () => {
		it('should allow variable usage with transitive dependency (A→B→C, C uses A)', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate',
					output: { data: { type: 'object' } },
				},
				{
					type: 'script',
					id: 'step2',
					name: 'Step 2',
					script: 'echo processing',
					depends: ['step1'],
				},
				{
					type: 'model',
					id: 'step3',
					name: 'Step 3',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.data }}',
					depends: ['step2'], // ✅ Transitive: step3 → step2 → step1
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});

		it('should error when no transitive dependency path exists', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate',
					output: { data: { type: 'object' } },
				},
				{
					type: 'script',
					id: 'step2',
					name: 'Step 2',
					script: 'echo processing',
					// No depends on step1
				},
				{
					type: 'model',
					id: 'step3',
					name: 'Step 3',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.data }}',
					depends: ['step2'], // ❌ step3 → step2, but step2 doesn't depend on step1
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0]).toMatchObject({
				severity: 'error',
				code: ValidationCode.UNDEFINED_VARIABLE,
				message: expect.stringContaining('step3') && expect.stringContaining('step1'),
			});
		});

		it('should handle complex transitive dependencies (diamond pattern)', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate',
					output: { value: { type: 'number' } },
				},
				{
					type: 'script',
					id: 'step2',
					name: 'Step 2',
					script: 'echo left',
					depends: ['step1'],
					output: { left: { type: 'string' } },
				},
				{
					type: 'script',
					id: 'step3',
					name: 'Step 3',
					script: 'echo right',
					depends: ['step1'],
					output: { right: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step4',
					name: 'Step 4',
					model: 'sonnet',
					prompt: 'Combine ${{ steps.step1.outputs.value }} ${{ steps.step2.outputs.left }} ${{ steps.step3.outputs.right }}',
					depends: ['step2', 'step3'], // ✅ Both paths: step4 → step2 → step1 and step4 → step3 → step1
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});
	});

	describe('Input and Task Variables', () => {
		it('should allow usage of inputs variables without dependencies', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Process ${{ inputs.userQuery }}',
					// ✅ No dependency needed for inputs
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});

		it('should allow usage of task metadata without dependencies', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Task priority: ${{ task.priority }}',
					// ✅ No dependency needed for task metadata
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});
	});

	describe('Different Step Types', () => {
		it('should validate script steps with variable references', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'generate',
					name: 'Generate',
					model: 'sonnet',
					prompt: 'Generate number',
					output: { number: { type: 'number' } },
				},
				{
					type: 'script',
					id: 'process',
					name: 'Process',
					script: 'echo Result: ${{ steps.generate.outputs.number }}',
					// ❌ No dependency
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0].location?.field).toBe('script');
		});

		it('should validate subflow steps with variable references in inputs', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'prepare',
					name: 'Prepare',
					model: 'sonnet',
					prompt: 'Prepare data',
					output: { data: { type: 'string' } },
				},
				{
					type: 'subflow',
					id: 'subprocess',
					name: 'Subprocess',
					flowId: 'child-flow',
					inputs: {
						data: '${{ steps.prepare.outputs.data }}',
					},
					// ❌ No dependency
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0].location?.field).toBe('inputs');
		});

		it('should validate when conditions', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'check',
					name: 'Check',
					model: 'sonnet',
					prompt: 'Check condition',
					output: { shouldContinue: { type: 'boolean' } },
				},
				{
					type: 'model',
					id: 'conditional',
					name: 'Conditional',
					model: 'sonnet',
					prompt: 'Execute conditionally',
					when: '${{ steps.check.outputs.shouldContinue }}',
					// ❌ No dependency
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0].location?.field).toBe('when');
		});
	});

	describe('Multiple Variable References', () => {
		it('should detect all invalid references in a single step', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate',
					output: { value1: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step2',
					name: 'Step 2',
					model: 'sonnet',
					prompt: 'Generate',
					output: { value2: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step3',
					name: 'Step 3',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.value1 }} and ${{ steps.step2.outputs.value2 }}',
					// ❌ No dependencies on step1 or step2
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(2);
			expect(collector.issues[0].message).toContain('step1');
			expect(collector.issues[1].message).toContain('step2');
		});

		it('should validate mixed valid and invalid references', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Generate',
					output: { value1: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step2',
					name: 'Step 2',
					model: 'sonnet',
					prompt: 'Generate',
					output: { value2: { type: 'string' } },
				},
				{
					type: 'model',
					id: 'step3',
					name: 'Step 3',
					model: 'sonnet',
					prompt: 'Use ${{ steps.step1.outputs.value1 }} and ${{ steps.step2.outputs.value2 }}',
					depends: ['step1'], // ✅ Has dependency on step1, ❌ but not on step2
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0].message).toContain('step2');
		});
	});

	describe('Edge Cases', () => {
		it('should handle flow with no variable references', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'step1',
					name: 'Step 1',
					model: 'sonnet',
					prompt: 'Static prompt with no variables',
				},
				{
					type: 'script',
					id: 'step2',
					name: 'Step 2',
					script: 'echo "No variables here"',
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});

		it('should handle empty flow', () => {
			const flow = createFlow([]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(0);
		});

		it('should handle step referencing itself (should error)', () => {
			const flow = createFlow([
				{
					type: 'model',
					id: 'recursive',
					name: 'Recursive',
					model: 'sonnet',
					prompt: 'Use ${{ steps.recursive.outputs.value }}',
					output: { value: { type: 'string' } },
					// ❌ Cannot reference itself
				},
			]);

			const collector = new MockIssueCollector();
			const validator = new DependencyOrderValidator(collector);

			validator.validateDependencyOrder(flow);

			expect(collector.issues).toHaveLength(1);
			expect(collector.issues[0].message).toContain('recursive');
		});
	});
});
