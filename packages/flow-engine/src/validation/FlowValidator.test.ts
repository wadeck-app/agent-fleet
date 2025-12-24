/**
 * Tests for FlowValidator - SubFlowStep validation
 */
import { createMockFlow, createMockModelStep, createMockSubFlowStep } from 'flow-engine/test-utils/factories';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, test } from 'vitest';

import { FlowRegistry } from '../registry/FlowRegistry';
import type { FlowDefinition, SubFlowStep } from '../types';
import { FlowValidator, ValidationCode } from './FlowValidator';

describe('FlowValidator - SubFlowStep Validation', () => {
	let validator: FlowValidator;
	let registry: FlowRegistry;
	let tempDir: string;

	beforeEach(() => {
		// Create a temporary directory for test flows
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-test-'));
		const flowsDir = path.join(tempDir, '.agent-fleet');
		fs.mkdirSync(flowsDir, { recursive: true });

		// Create empty flows.yml to avoid warnings
		fs.writeFileSync(path.join(flowsDir, 'flows.yml'), '');

		registry = new FlowRegistry(tempDir);
		validator = new FlowValidator(registry);
	});

	describe('Schema Validation', () => {
		test('should error when flowId is missing', () => {
			const flow = createMockFlow({
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						name: 'Step 1',
						flowId: '', // Empty flowId
					}),
				],
			});

			const result = validator.validate(flow);

			expect(result.valid).toBe(false);
			expect(result.issues).toHaveLength(1);
			expect(result.issues[0].code).toBe(ValidationCode.MISSING_FIELD);
			expect(result.issues[0].message).toContain('must have a non-empty flowId');
			expect(result.issues[0].location?.stepId).toBe('step1');
		});

		test('should error when flowId references non-existent flow', () => {
			const flow = createMockFlow({
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						name: 'Step 1',
						flowId: 'non-existent-flow',
					}),
				],
			});

			const result = validator.validate(flow);

			expect(result.valid).toBe(false);
			expect(result.issues).toHaveLength(1);
			expect(result.issues[0].code).toBe(ValidationCode.UNDEFINED_FLOW);
			expect(result.issues[0].message).toContain('references non-existent flow');
			expect(result.issues[0].message).toContain('non-existent-flow');
		});

		test('should error when workspaceStrategy is invalid', () => {
			const flow = createMockFlow({
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						name: 'Step 1',
						flowId: 'simple-qa', // Use default flow
						workspaceStrategy: 'invalid' as any,
					}),
				],
			});

			const result = validator.validate(flow);

			expect(result.valid).toBe(false);
			const strategyError = result.issues.find(
				i => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'workspaceStrategy'
			);
			expect(strategyError).toBeDefined();
			expect(strategyError?.message).toContain('invalid workspaceStrategy');
		});

		test('should error when inputs is not an object', () => {
			const flow = createMockFlow({
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						name: 'Step 1',
						flowId: 'simple-qa',
						inputs: 'not an object' as any,
					}),
				],
			});

			const result = validator.validate(flow);

			expect(result.valid).toBe(false);
			const inputsError = result.issues.find(
				i => i.code === ValidationCode.INVALID_TYPE && i.location?.field === 'inputs'
			);
			expect(inputsError).toBeDefined();
			expect(inputsError?.message).toContain('inputs must be an object');
		});

		test('should accept valid workspaceStrategy values', () => {
			const flowInherit = createMockFlow({
				id: 'test-flow-inherit',
				name: 'Test Flow Inherit',
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						flowId: 'simple-qa',
						inputs: { question: 'test' },
						workspaceStrategy: 'inherit',
					}),
				],
			});

			const resultInherit = validator.validate(flowInherit);
			const strategyErrorInherit = resultInherit.issues.find(
				i => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'workspaceStrategy'
			);
			expect(strategyErrorInherit).toBeUndefined();

			const flowSeparate = createMockFlow({
				id: 'test-flow-separate',
				name: 'Test Flow Separate',
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						flowId: 'simple-qa',
						inputs: { question: 'test' },
						workspaceStrategy: 'separate',
					}),
				],
			});

			const resultSeparate = validator.validate(flowSeparate);
			const strategyErrorSeparate = resultSeparate.issues.find(
				i => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'workspaceStrategy'
			);
			expect(strategyErrorSeparate).toBeUndefined();
		});
	});

	describe('Circular Reference Detection', () => {
		test('should detect direct circular reference (flow calling itself)', () => {
			// Register a flow that calls itself
			const selfReferencingFlow = createMockFlow({
				id: 'self-reference',
				name: 'Self Referencing Flow',
				description: 'A flow that calls itself',
				steps: [
					createMockSubFlowStep({
						id: 'recursive-step',
						name: 'Recursive Step',
						flowId: 'self-reference', // Calls itself!
					}),
				],
			});

			const result = validator.validate(selfReferencingFlow);

			expect(result.valid).toBe(false);
			expect(result.issues).toHaveLength(1);
			expect(result.issues[0].code).toBe(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE);
			expect(result.issues[0].message).toContain('circular reference');
			expect(result.issues[0].message).toContain('calls itself');
		});

		test('should detect indirect circular dependency (A→B→A)', () => {
			// Register flow A
			const flowA = createMockFlow({
				id: 'flow-a',
				name: 'Flow A',
				description: 'Flow A',
				steps: [
					createMockSubFlowStep({
						id: 'call-b',
						name: 'Call B',
						flowId: 'flow-b',
					}),
				],
			});

			// Register flow B that calls back to A
			const flowB = createMockFlow({
				id: 'flow-b',
				name: 'Flow B',
				description: 'Flow B',
				steps: [
					createMockSubFlowStep({
						id: 'call-a',
						name: 'Call A',
						flowId: 'flow-a', // Circular!
					}),
				],
			});

			// Register flows directly without validation (bypass registerFlow validation)
			// This simulates a scenario where flows are loaded from file
			(registry as any).flows.set('flow-a', flowA);
			(registry as any).flows.set('flow-b', flowB);

			// Validate flow A (should detect circular dependency)
			const resultA = validator.validate(flowA);
			expect(resultA.valid).toBe(false);
			const circularError = resultA.issues.find(i => i.code === ValidationCode.CIRCULAR_SUBFLOW_REFERENCE);
			expect(circularError).toBeDefined();
			expect(circularError?.message).toContain('circular dependency chain');
		});

		test('should detect deep circular dependency (A→B→C→A)', () => {
			// Register flow A
			const flowA = createMockFlow({
				id: 'flow-a',
				name: 'Flow A',
				description: 'Flow A',
				steps: [
					createMockSubFlowStep({
						id: 'call-b',
						name: 'Call B',
						flowId: 'flow-b',
					}),
				],
			});

			// Register flow B that calls C
			const flowB = createMockFlow({
				id: 'flow-b',
				name: 'Flow B',
				description: 'Flow B',
				steps: [
					createMockSubFlowStep({
						id: 'call-c',
						name: 'Call C',
						flowId: 'flow-c',
					}),
				],
			});

			// Register flow C that calls back to A
			const flowC = createMockFlow({
				id: 'flow-c',
				name: 'Flow C',
				description: 'Flow C',
				steps: [
					createMockSubFlowStep({
						id: 'call-a',
						name: 'Call A',
						flowId: 'flow-a', // Circular!
					}),
				],
			});

			// Register flows directly without validation (bypass registerFlow validation)
			// This simulates a scenario where flows are loaded from file
			(registry as any).flows.set('flow-a', flowA);
			(registry as any).flows.set('flow-b', flowB);
			(registry as any).flows.set('flow-c', flowC);

			// Validate flow A (should detect circular dependency)
			const resultA = validator.validate(flowA);
			expect(resultA.valid).toBe(false);
			const circularError = resultA.issues.find(i => i.code === ValidationCode.CIRCULAR_SUBFLOW_REFERENCE);
			expect(circularError).toBeDefined();
			expect(circularError?.message).toContain('circular dependency chain');
		});

		test('should allow valid nested flows without circular dependencies', () => {
			// Register base flow
			const baseFlow = createMockFlow({
				id: 'base-flow',
				name: 'Base Flow',
				description: 'Base Flow',
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'test',
					}),
				],
			});

			// Register middle flow that calls base
			const middleFlow = createMockFlow({
				id: 'middle-flow',
				name: 'Middle Flow',
				description: 'Middle Flow',
				steps: [
					createMockSubFlowStep({
						id: 'call-base',
						name: 'Call Base',
						flowId: 'base-flow',
					}),
				],
			});

			// Register top flow that calls middle
			const topFlow = createMockFlow({
				id: 'top-flow',
				name: 'Top Flow',
				description: 'Top Flow',
				steps: [
					createMockSubFlowStep({
						id: 'call-middle',
						name: 'Call Middle',
						flowId: 'middle-flow',
					}),
				],
			});

			// Register all flows
			registry.registerFlow(baseFlow);
			registry.registerFlow(middleFlow);
			registry.registerFlow(topFlow);

			// Validate all flows (should pass)
			const resultBase = validator.validate(baseFlow);
			expect(resultBase.valid).toBe(true);

			const resultMiddle = validator.validate(middleFlow);
			expect(resultMiddle.valid).toBe(true);

			const resultTop = validator.validate(topFlow);
			expect(resultTop.valid).toBe(true);
		});
	});

	describe('allowRecursion Flag Validation', () => {
		test('should allow recursive flow with allowRecursion=true (warning only)', () => {
			// Register a recursive flow with allowRecursion flag
			const recursiveFlow = createMockFlow({
				id: 'recursive-flow',
				name: 'Recursive Flow',
				description: 'A flow with explicit recursion',
				steps: [
					createMockSubFlowStep({
						id: 'recursive-step',
						name: 'Recursive Step',
						flowId: 'recursive-flow', // Calls itself
						allowRecursion: true, // Explicitly allowed
					}),
				],
			});

			// Register the flow so it can be found during validation
			registry.registerFlow(recursiveFlow);

			const result = validator.validate(recursiveFlow);

			// Should pass validation (no errors)
			expect(result.valid).toBe(true);
			expect(result.summary.errors).toBe(0);

			// But should have a warning about exit conditions
			expect(result.summary.warnings).toBe(1);
			const warning = result.issues.find(i => i.severity === 'warning');
			expect(warning).toBeDefined();
			expect(warning?.code).toBe(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE);
			expect(warning?.message).toContain('recursive');
			expect(warning?.message).toContain('exit condition');
		});

		test('should error when recursive flow missing allowRecursion flag', () => {
			// Create a recursive flow WITHOUT allowRecursion flag
			const recursiveFlow = createMockFlow({
				id: 'recursive-flow-no-flag',
				name: 'Recursive Flow No Flag',
				description: 'A flow without allowRecursion',
				steps: [
					createMockSubFlowStep({
						id: 'recursive-step',
						name: 'Recursive Step',
						flowId: 'recursive-flow-no-flag', // Calls itself
						// No allowRecursion flag
					}),
				],
			});

			// Don't register - validation should fail due to circular reference
			// (circular reference check happens BEFORE flow existence check)
			const result = validator.validate(recursiveFlow);

			// Should fail validation
			expect(result.valid).toBe(false);
			expect(result.summary.errors).toBe(1);

			const error = result.issues.find(i => i.severity === 'error');
			expect(error).toBeDefined();
			expect(error?.code).toBe(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE);
			expect(error?.message).toContain('circular reference');
			expect(error?.suggestion).toContain('allowRecursion: true');
		});

		test('should error when allowRecursion=true but flow is NOT recursive', () => {
			// Register a target flow
			const targetFlow = createMockFlow({
				id: 'target-flow',
				name: 'Target Flow',
				description: 'Target Flow',
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'test',
					}),
				],
			});
			registry.registerFlow(targetFlow);

			// Register a flow with unnecessary allowRecursion flag
			const flow = createMockFlow({
				id: 'calling-flow',
				name: 'Calling Flow',
				description: 'Calling Flow',
				steps: [
					createMockSubFlowStep({
						id: 'call-target',
						name: 'Call Target',
						flowId: 'target-flow', // NOT recursive
						allowRecursion: true, // Flag is unnecessary!
					}),
				],
			});

			const result = validator.validate(flow);

			// Should fail validation
			expect(result.valid).toBe(false);
			expect(result.summary.errors).toBe(1);

			const error = result.issues.find(i => i.severity === 'error');
			expect(error).toBeDefined();
			expect(error?.code).toBe(ValidationCode.INVALID_VALUE);
			expect(error?.message).toContain('allowRecursion=true');
			expect(error?.message).toContain('does not call itself');
			expect(error?.suggestion).toContain('Remove the unnecessary allowRecursion flag');
		});
	});

	describe('Input Validation', () => {
		test('should warn when required input is missing', () => {
			// Register a flow with required inputs
			const targetFlow = createMockFlow({
				id: 'target-flow',
				name: 'Target Flow',
				description: 'Target Flow',
				inputs: {
					requiredInput1: 'string',
					requiredInput2: 'number',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'test',
					}),
				],
			});

			registry.registerFlow(targetFlow);

			// Create a flow that calls target but doesn't provide all inputs
			const callerFlow = createMockFlow({
				id: 'caller-flow',
				name: 'Caller Flow',
				description: 'Caller Flow',
				steps: [
					createMockSubFlowStep({
						id: 'call-target',
						name: 'Call Target',
						flowId: 'target-flow',
						inputs: {
							requiredInput1: 'value1',
							// Missing requiredInput2!
						},
					}),
				],
			});

			const result = validator.validate(callerFlow);

			// Should have warnings (not errors) for missing inputs
			const missingInputWarnings = result.issues.filter(
				i => i.severity === 'warning' && i.message.includes('missing required input')
			);
			expect(missingInputWarnings.length).toBeGreaterThan(0);
			expect(missingInputWarnings[0].message).toContain('requiredInput2');
		});

		test('should pass when all required inputs are provided', () => {
			// Register a flow with required inputs
			const targetFlow = createMockFlow({
				id: 'target-flow',
				name: 'Target Flow',
				description: 'Target Flow',
				inputs: {
					requiredInput1: 'string',
					requiredInput2: 'number',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'test',
					}),
				],
			});

			registry.registerFlow(targetFlow);

			// Create a flow that calls target and provides all inputs
			const callerFlow = createMockFlow({
				id: 'caller-flow',
				name: 'Caller Flow',
				description: 'Caller Flow',
				steps: [
					createMockSubFlowStep({
						id: 'call-target',
						name: 'Call Target',
						flowId: 'target-flow',
						inputs: {
							requiredInput1: 'value1',
							requiredInput2: '42',
						},
					}),
				],
			});

			const result = validator.validate(callerFlow);

			// Should not have warnings about missing inputs
			const missingInputWarnings = result.issues.filter(
				i => i.severity === 'warning' && i.message.includes('missing required input')
			);
			expect(missingInputWarnings).toHaveLength(0);
		});
	});

	describe('Validator without FlowRegistry', () => {
		test('should skip flow reference validation when registry is not provided', () => {
			const validatorWithoutRegistry = new FlowValidator();

			const flow = createMockFlow({
				id: 'test-flow',
				name: 'Test Flow',
				description: 'Test',
				steps: [
					createMockSubFlowStep({
						id: 'step1',
						name: 'Step 1',
						flowId: 'non-existent-flow',
					}),
				],
			});

			const result = validatorWithoutRegistry.validate(flow);

			// Should not error about undefined flow since registry is not available
			const undefinedFlowError = result.issues.find(i => i.code === ValidationCode.UNDEFINED_FLOW);
			expect(undefinedFlowError).toBeUndefined();
		});
	});
});
