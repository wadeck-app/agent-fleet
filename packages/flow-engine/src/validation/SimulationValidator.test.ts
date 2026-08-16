/**
 * SimulationValidator Tests
 *
 * Tests for simulation-based validation:
 * - Whitelist-based template expression validation
 * - Dependency chain analysis
 * - Execution path analysis
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SimulationValidator } from './SimulationValidator';
import { ValidationCode } from './ValidationTypes';

/** Build a minimal single-step model flow with the given prompt text. */
function makeFlow(prompt: string): { flow: FlowDefinition; stepIds: Set<string> } {
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
				prompt,
			},
		],
	};
	return { flow, stepIds: new Set(['step1']) };
}

/** Filter issues to INVALID_TEMPLATE_SYNTAX only. */
function syntaxErrors(issueCollector: MockIssueCollector) {
	return issueCollector.issues.filter(i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX);
}

describe('SimulationValidator', () => {
	let validator: SimulationValidator;
	let issueCollector: MockIssueCollector;

	beforeEach(() => {
		issueCollector = new MockIssueCollector();
		validator = new SimulationValidator(issueCollector);
	});

	// ---------------------------------------------------------------------------
	// Template expression validation (whitelist)
	// ---------------------------------------------------------------------------

	describe('template expression validation (whitelist)', () => {
		// --- VALID — should produce NO INVALID_TEMPLATE_SYNTAX errors ---

		it('should accept inputs.simple-name', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ inputs.simple-name }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept inputs.camelCase', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ inputs.camelCase }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept inputs.with_underscore', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ inputs.with_underscore }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept steps.analyze-storage.outputs.result (regression #9)', () => {
			const { flow, stepIds } = makeFlow('Based on ${{ steps.analyze-storage.outputs.result }}, proceed');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept steps.fetch-and-parse-data.outputs.entityTypes (multi-hyphen regression)', () => {
			const { flow, stepIds } = makeFlow('Report: ${{ steps.fetch-and-parse-data.outputs.entityTypes }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept steps.myStep.outputs.result', () => {
			const { flow, stepIds } = makeFlow('Result: ${{ steps.myStep.outputs.result }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept steps.step_1.outputs.count', () => {
			const { flow, stepIds } = makeFlow('Count: ${{ steps.step_1.outputs.count }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept flow.allLogs', () => {
			const { flow, stepIds } = makeFlow('Logs: ${{ flow.allLogs }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept task.priority', () => {
			const { flow, stepIds } = makeFlow('Priority: ${{ task.priority }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		// --- INVALID — should produce INVALID_TEMPLATE_SYNTAX error ---

		it('should flag arithmetic with spaces: steps.x.outputs.count + 1', () => {
			const { flow, stepIds } = makeFlow('Count is ${{ steps.x.outputs.count + 1 }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag arithmetic without spaces: steps.x.outputs.count+1 (key regression)', () => {
			const { flow, stepIds } = makeFlow('Count is ${{ steps.x.outputs.count+1 }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag arithmetic: inputs.x * 2', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ inputs.x * 2 }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag wrong structure (too deep): steps.x.y.z.w.v', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ steps.x.y.z.w.v }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag unknown context: unknown.something', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ unknown.something }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag function call: format(inputs.x)', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ format(inputs.x) }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag incomplete step reference: steps.x (missing .outputs.varName)', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ steps.x }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag empty expression', () => {
			// ${{  }} — two spaces inside, trimmed to empty string
			const { flow, stepIds } = makeFlow('Value: ${{  }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		it('should flag incomplete output path: steps.x.outputs (missing var name)', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ steps.x.outputs }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});

		// --- context.* — runtime execution context variables ---

		it('should accept context.cwd', () => {
			const { flow, stepIds } = makeFlow('Dir: ${{ context.cwd }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept context.workspaceDir', () => {
			const { flow, stepIds } = makeFlow('Workspace: ${{ context.workspaceDir }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should accept context.key_with-mixed_chars', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ context.key_with-mixed_chars }}');
			validator.validateSimulation(flow, stepIds);
			expect(syntaxErrors(issueCollector)).toHaveLength(0);
		});

		it('should flag context without a key: context (bare root)', () => {
			const { flow, stepIds } = makeFlow('Value: ${{ context }}');
			validator.validateSimulation(flow, stepIds);
			const errors = syntaxErrors(issueCollector);
			expect(errors.length).toBeGreaterThanOrEqual(1);
			expect(errors[0].severity).toBe('error');
		});
	});

	// ---------------------------------------------------------------------------
	// Undeclared output key validation
	// ---------------------------------------------------------------------------

	describe('undeclared output key validation', () => {
		function makeFlowWithOutputRef(outputConfig: Record<string, unknown> | undefined, ref: string): { flow: FlowDefinition; stepIds: Set<string> } {
			const producer: Record<string, unknown> = {
				id: 'producer',
				name: 'Producer',
				type: 'model',
				model: 'haiku',
				prompt: 'Generate something',
			};
			if (outputConfig !== undefined) {
				producer.output = outputConfig;
			}
			const consumer: Record<string, unknown> = {
				id: 'consumer',
				name: 'Consumer',
				type: 'model',
				model: 'haiku',
				depends: ['producer'],
				prompt: `Use: ${ref}`,
			};
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [producer, consumer] as unknown as FlowDefinition['steps'],
			};
			return { flow, stepIds: new Set(['producer', 'consumer']) };
		}

		it('accepts declared output key', () => {
			const { flow, stepIds } = makeFlowWithOutputRef(
				{ result: { type: 'string' } },
				'${{ steps.producer.outputs.result }}'
			);
			validator.validateSimulation(flow, stepIds);
			const errors = issueCollector.issues.filter(i => i.code === ValidationCode.UNDECLARED_OUTPUT_KEY);
			expect(errors).toHaveLength(0);
		});

		it('rejects undeclared output key when output config is explicit', () => {
			const { flow, stepIds } = makeFlowWithOutputRef(
				{ result: { type: 'string' } },
				'${{ steps.producer.outputs.nonexistent }}'
			);
			validator.validateSimulation(flow, stepIds);
			const errors = issueCollector.issues.filter(i => i.code === ValidationCode.UNDECLARED_OUTPUT_KEY);
			expect(errors).toHaveLength(1);
			expect(errors[0].severity).toBe('error');
		});

		it('accepts any output key when step has no output config', () => {
			const { flow, stepIds } = makeFlowWithOutputRef(
				undefined,
				'${{ steps.producer.outputs.anything }}'
			);
			validator.validateSimulation(flow, stepIds);
			const errors = issueCollector.issues.filter(i => i.code === ValidationCode.UNDECLARED_OUTPUT_KEY);
			expect(errors).toHaveLength(0);
		});

		it('rejects undeclared key in script step', () => {
			const flow: FlowDefinition = {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test',
				description: 'Test',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: {},
				steps: [
					{ id: 'gen', name: 'Gen', type: 'model', model: 'haiku', prompt: 'Do it', output: { status: { type: 'string' } } },
					{ id: 'use', name: 'Use', type: 'script', depends: ['gen'], script: 'echo ${{ steps.gen.outputs.missing }}' },
				] as unknown as FlowDefinition['steps'],
			};
			validator.validateSimulation(flow, new Set(['gen', 'use']));
			const errors = issueCollector.issues.filter(i => i.code === ValidationCode.UNDECLARED_OUTPUT_KEY);
			expect(errors).toHaveLength(1);
			expect(errors[0].severity).toBe('error');
		});
	});
});
