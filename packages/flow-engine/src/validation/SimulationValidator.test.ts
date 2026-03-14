/**
 * SimulationValidator Tests
 *
 * Tests for simulation-based validation:
 * - Arithmetic detection in template expressions
 * - Dependency chain analysis
 * - Execution path analysis
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SimulationValidator } from './SimulationValidator';
import { ValidationCode } from './ValidationTypes';

describe('SimulationValidator', () => {
	let validator: SimulationValidator;
	let issueCollector: MockIssueCollector;

	beforeEach(() => {
		issueCollector = new MockIssueCollector();
		validator = new SimulationValidator(issueCollector);
	});

	// ---------------------------------------------------------------------------
	// Arithmetic detection
	// ---------------------------------------------------------------------------

	describe('arithmetic detection in template expressions', () => {
		it('should NOT flag hyphens in step IDs as arithmetic (regression)', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'analyze-storage',
						name: 'Analyze Storage',
						type: 'model',
						model: 'sonnet',
						prompt: 'Analyze the storage system',
					},
					{
						id: 'implement-changes',
						name: 'Implement Changes',
						type: 'model',
						model: 'sonnet',
						depends: ['analyze-storage'],
						prompt: 'Based on ${{ steps.analyze-storage.outputs.result }}, implement the changes',
					},
				],
			};

			const stepIds = new Set(['analyze-storage', 'implement-changes']);
			validator.validateSimulation(flow, stepIds);

			const arithmeticErrors = issueCollector.issues.filter(
				i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX && i.message.includes('arithmetic')
			);
			expect(arithmeticErrors).toHaveLength(0);
		});

		it('should NOT flag multi-segment hyphenated step IDs as arithmetic', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{
						id: 'fetch-and-parse-data',
						name: 'Fetch And Parse Data',
						type: 'script',
						script: 'echo done',
					},
					{
						id: 'generate-final-report',
						name: 'Generate Final Report',
						type: 'model',
						model: 'sonnet',
						depends: ['fetch-and-parse-data'],
						prompt: 'Generate report using ${{ steps.fetch-and-parse-data.outputs.result }}',
					},
				],
			};

			const stepIds = new Set(['fetch-and-parse-data', 'generate-final-report']);
			validator.validateSimulation(flow, stepIds);

			const arithmeticErrors = issueCollector.issues.filter(
				i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX && i.message.includes('arithmetic')
			);
			expect(arithmeticErrors).toHaveLength(0);
		});

		it('should flag actual arithmetic with spaces around operators', () => {
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
						prompt: 'Count is ${{ steps.x.outputs.count + 1 }}',
					},
				],
			};

			const stepIds = new Set(['step1']);
			validator.validateSimulation(flow, stepIds);

			const arithmeticErrors = issueCollector.issues.filter(
				i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX && i.message.includes('arithmetic')
			);
			expect(arithmeticErrors).toHaveLength(1);
			expect(arithmeticErrors[0].severity).toBe('error');
		});

		it('should flag multiplication with spaces in template expressions', () => {
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
						prompt: 'Value is ${{ steps.x.outputs.val * 2 }}',
					},
				],
			};

			const stepIds = new Set(['step1']);
			validator.validateSimulation(flow, stepIds);

			const arithmeticErrors = issueCollector.issues.filter(
				i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX && i.message.includes('arithmetic')
			);
			expect(arithmeticErrors).toHaveLength(1);
		});
	});
});
