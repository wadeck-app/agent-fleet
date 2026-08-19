/**
 * Tests for ContractValidator
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { ContractValidator } from './ContractValidator';
import { ValidationCode } from './ValidationTypes';

describe('ContractValidator', () => {
	let collector: MockIssueCollector;
	let validator: ContractValidator;

	beforeEach(() => {
		collector = new MockIssueCollector();
		validator = new ContractValidator(collector);
	});

	function makeFlow(overrides: Partial<FlowDefinition> = {}): FlowDefinition {
		return {
			id: 'test-flow',
			version: '1.0.0',
			name: 'Test',
			description: 'Test',
			workspace: { mode: 'manual', gitStrategy: 'none', reusePolicy: 'never' },
			inputs: {},
			steps: [],
			...overrides,
		};
	}

	describe('preProcess.validateInputs', () => {
		it('should not emit issues when validateInputs references a valid flow input', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: { priority: { type: 'string', required: false, source: 'auto-discovered' as const } },
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									priority: [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasError()).toBe(false);
		});

		it('should emit UNDEFINED_VARIABLE when validateInputs references unknown field', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: {},
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									nonexistent: [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.UNDEFINED_VARIABLE)).toBe(true);
			const issue = collector.getIssueByCode(ValidationCode.UNDEFINED_VARIABLE)!;
			expect(issue.location!.field).toContain('contract.preProcess.validateInputs.nonexistent');
		});

		it('should not emit issues when validateInputs references a valid step output (stepId.outputName)', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'producer',
						type: 'script', name: 'Test Step',
						script: 'echo',
						output: { result: { type: 'string', pattern: '(.+)' } },
					},
					{
						id: 'consumer',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									'producer.result': [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['producer', 'consumer']));

			expect(collector.hasError()).toBe(false);
		});

		it('should emit UNDEFINED_VARIABLE when step output reference has unknown stepId', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									'missing-step.result': [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.UNDEFINED_VARIABLE)).toBe(true);
		});

		it('should accept required, pattern, enum, min, max, minLength, maxLength rule types for appropriate variable types', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: {
					name: { type: 'string', required: false, source: 'auto-discovered' as const },
					count: { type: 'number', required: false, source: 'auto-discovered' as const },
				},
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									name: [
										{ type: 'required' },
										{ type: 'pattern', value: '^[a-z]+$' },
										{ type: 'minLength', value: 2 },
										{ type: 'maxLength', value: 50 },
									],
									count: [
										{ type: 'required' },
										{ type: 'min', value: 0 },
										{ type: 'max', value: 100 },
									],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasError()).toBe(false);
		});

		it('should emit INVALID_TYPE when rule type is invalid for the variable type', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: { count: { type: 'number', required: false, source: 'auto-discovered' as const } },
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									count: [{ type: 'pattern', value: '^\\d+$' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.INVALID_TYPE)).toBe(true);
		});

		it('should emit INVALID_TYPE when pattern rule has non-string value', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: { name: { type: 'string', required: false, source: 'auto-discovered' as const } },
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									name: [{ type: 'pattern', value: 42 }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.INVALID_TYPE)).toBe(true);
		});

		it('should emit INVALID_TYPE when enum rule has non-array value', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: { priority: { type: 'string', required: false, source: 'auto-discovered' as const } },
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: {
								validateInputs: {
									priority: [{ type: 'enum', value: 'low' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.INVALID_TYPE)).toBe(true);
		});
	});

	describe('preProcess.required', () => {
		it('should not emit issues when required lists a valid flow input', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: { priority: { type: 'string', required: false, source: 'auto-discovered' as const } },
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: { required: ['priority'] },
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasError()).toBe(false);
		});

		it('should emit UNDEFINED_INPUT when required lists an unknown input name', () => {
			const flow = makeFlow({
				_autoDiscoveredInputs: {},
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							preProcess: { required: ['nonexistent'] },
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.UNDEFINED_INPUT)).toBe(true);
		});
	});

	describe('postProcess.validateOutputs', () => {
		it('should not emit issues when validateOutputs references a defined step output', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						output: { result: { type: 'string', pattern: '(.+)' } },
						contract: {
							postProcess: {
								validateOutputs: {
									result: [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasError()).toBe(false);
		});

		it('should emit UNDEFINED_OUTPUT when validateOutputs references undefined output variable', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						output: { result: { type: 'string', pattern: '(.+)' } },
						contract: {
							postProcess: {
								validateOutputs: {
									nonexistent: [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.UNDEFINED_OUTPUT)).toBe(true);
			const issue = collector.getIssueByCode(ValidationCode.UNDEFINED_OUTPUT)!;
			expect(issue.location!.field).toContain('contract.postProcess.validateOutputs.nonexistent');
		});

		it('should emit MISSING_FIELD when step has postProcess contract but no output config', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						contract: {
							postProcess: {
								validateOutputs: {
									result: [{ type: 'required' }],
								},
							},
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.MISSING_FIELD)).toBe(true);
		});

		it('should emit UNDEFINED_OUTPUT when postProcess.required lists undefined output', () => {
			const flow = makeFlow({
				steps: [
					{
						id: 'step1',
						type: 'script', name: 'Test Step',
						script: 'echo',
						output: { result: { type: 'string', pattern: '(.+)' } },
						contract: {
							postProcess: { required: ['nonexistent'] },
						},
					},
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasCode(ValidationCode.UNDEFINED_OUTPUT)).toBe(true);
		});
	});

	describe('no-contract step', () => {
		it('should not emit issues for steps without a contract', () => {
			const flow = makeFlow({
				steps: [
					{ id: 'step1', type: 'script', name: 'Test Step', script: 'echo' },
				],
			});

			validator.validateContracts(flow, new Set(['step1']));

			expect(collector.hasError()).toBe(false);
		});
	});
});
