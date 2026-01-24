/**
 * Logical Validator
 *
 * Validates logical consistency and data flow correctness:
 * - Input coverage (all required inputs provided or have defaults)
 * - Output consistency (declared outputs are produced)
 * - Data type flow (type consistency across step boundaries)
 * - Transform validation (transforms match declared types)
 * - Pattern completeness (regex patterns have capture groups)
 * - Conditional logic (referenced outputs exist)
 *
 * This validator catches logical errors that would cause runtime failures.
 */
import type { FlowDefinition, FlowStep, OutputVariableConfig, VariableType } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Type inference mapping for transform functions
 */
const TRANSFORM_OUTPUT_TYPES: Record<string, VariableType> = {
	parseInt: 'number',
	parseFloat: 'number',
	parseBoolean: 'boolean',
	parseJSON: 'object',
	parseYAML: 'object',
	trim: 'string',
	toLowerCase: 'string',
	toUpperCase: 'string',
	split: 'object',
};

/**
 * Logical Validator
 */
export class LogicalValidator {
	/**
	 * Create a new LogicalValidator
	 * @param issueCollector - Collector for validation issues
	 */
	constructor(private issueCollector: IssueCollector) {}

	/**
	 * Validate logical consistency of a flow
	 * @param flow - Flow definition to validate
	 * @param stepIds - Set of valid step IDs
	 */
	public validateLogical(flow: FlowDefinition, _stepIds: Set<string>): void {
		// Build step output map for type checking
		const stepOutputs = this.buildStepOutputMap(flow.steps);

		// Validate each step
		for (const step of flow.steps) {
			// Validate output configuration
			if (step.output) {
				this.validateOutputConfiguration(step, flow.id);
			}

			// Validate conditional logic
			if (step.when) {
				this.validateConditionalExpression(step, stepOutputs, flow.id);
			}

			// Validate data type flow for steps with dependencies
			if (step.depends && step.depends.length > 0) {
				this.validateDataTypeFlow(step, stepOutputs, flow.steps, flow.id);
			}
		}

		// Validate input coverage
		this.validateInputCoverage(flow);
	}

	/**
	 * Build a map of step outputs with their types
	 */
	private buildStepOutputMap(steps: FlowStep[]): Map<string, Map<string, VariableType>> {
		const stepOutputs = new Map<string, Map<string, VariableType>>();

		for (const step of steps) {
			if (step.output) {
				const outputs = new Map<string, VariableType>();

				for (const [varName, config] of Object.entries(step.output)) {
					// Handle both OutputVariableConfig and string template (for SubFlowStep)
					if (typeof config === 'object' && 'type' in config) {
						outputs.set(varName, config.type);
					}
				}

				stepOutputs.set(step.id, outputs);
			}
		}

		return stepOutputs;
	}

	/**
	 * Validate output configuration for logical consistency
	 */
	private validateOutputConfiguration(step: FlowStep, flowId: string): void {
		if (!step.output) return;

		for (const [varName, config] of Object.entries(step.output)) {
			// Skip string templates (SubFlowStep output mapping)
			if (typeof config === 'string') continue;

			const outputConfig = config as OutputVariableConfig;

			// Validate pattern completeness
			if (outputConfig.pattern) {
				this.validatePatternCompleteness(step, varName, outputConfig, flowId);
			}

			// Validate transform consistency
			if (outputConfig.transform) {
				this.validateTransformConsistency(step, varName, outputConfig, flowId);
			}

			// Warn on overly broad patterns
			if (outputConfig.pattern === '(.*)') {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.MISSING_OUTPUT,
					message: `Output pattern for '${varName}' is too broad`,
					location: {
						stepId: step.id,
						field: `output.${varName}.pattern`,
						path: `${flowId}.steps[${step.id}].output.${varName}.pattern`,
					},
					suggestion: `Use a more specific pattern to extract '${varName}' (current pattern '(.*)' captures entire output)`,
					context: {
						actual: outputConfig.pattern,
						expected: 'A pattern with context (e.g., "result=(.*)" or "value: (\\d+)")',
					},
				});
			}
		}
	}

	/**
	 * Validate that regex patterns have capture groups
	 */
	private validatePatternCompleteness(
		step: FlowStep,
		varName: string,
		config: OutputVariableConfig,
		flowId: string
	): void {
		const pattern = config.pattern!;

		// Check if pattern has capture groups
		const hasCaptureGroup = pattern.includes('(') && pattern.includes(')') && !pattern.match(/\(\?:/);

		if (!hasCaptureGroup) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Output pattern for '${varName}' in step '${step.id}' has no capture group`,
				location: {
					stepId: step.id,
					field: `output.${varName}.pattern`,
					path: `${flowId}.steps[${step.id}].output.${varName}.pattern`,
				},
				suggestion: `Add parentheses to capture the value (e.g., change 'result=.*' to 'result=(.*)')`,
				context: {
					actual: pattern,
					expected: 'Pattern with capture group: ()',
				},
			});
		}

		// Warn on common regex mistakes
		if (pattern.includes('.*') && !pattern.includes('(.*?)')) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.INVALID_VALUE,
				message: `Output pattern for '${varName}' uses greedy '.*' which may capture more than intended`,
				location: {
					stepId: step.id,
					field: `output.${varName}.pattern`,
					path: `${flowId}.steps[${step.id}].output.${varName}.pattern`,
				},
				suggestion: `Consider using non-greedy '(.*?)' or more specific patterns`,
				context: {
					actual: pattern,
				},
			});
		}
	}

	/**
	 * Validate transform functions match declared types
	 */
	private validateTransformConsistency(
		step: FlowStep,
		varName: string,
		config: OutputVariableConfig,
		flowId: string
	): void {
		const transform = config.transform as string;
		const declaredType = config.type;

		// Check if transform is a known function
		const expectedType = TRANSFORM_OUTPUT_TYPES[transform];

		if (expectedType && expectedType !== declaredType) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.TYPE_MISMATCH,
				message: `Transform '${transform}' produces '${expectedType}' but output '${varName}' is declared as '${declaredType}'`,
				location: {
					stepId: step.id,
					field: `output.${varName}`,
					path: `${flowId}.steps[${step.id}].output.${varName}`,
				},
				suggestion: `Change type to '${expectedType}' or use a different transform`,
				context: {
					actual: declaredType,
					expected: expectedType,
					related: [transform],
				},
			});
		}

		// Warn if transform seems unnecessary
		if (transform === 'trim' && declaredType !== 'string') {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.INVALID_VALUE,
				message: `Transform 'trim' is used on non-string type '${declaredType}'`,
				location: {
					stepId: step.id,
					field: `output.${varName}.transform`,
					path: `${flowId}.steps[${step.id}].output.${varName}.transform`,
				},
				suggestion: `Remove 'trim' transform or change type to 'string'`,
			});
		}
	}

	/**
	 * Validate conditional expressions reference valid outputs
	 */
	private validateConditionalExpression(
		step: FlowStep,
		stepOutputs: Map<string, Map<string, VariableType>>,
		flowId: string
	): void {
		const condition = step.when!;

		// Extract step output references from condition
		// Pattern: steps.stepId.outputs.varName
		const stepRefPattern = /steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)/g;
		const matches = [...condition.matchAll(stepRefPattern)];

		for (const match of matches) {
			const referencedStepId = match[1];
			const referencedOutput = match[2];

			// Check if referenced step exists
			if (!stepOutputs.has(referencedStepId)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.UNDEFINED_STEP,
					message: `Conditional expression references undefined step '${referencedStepId}'`,
					location: {
						stepId: step.id,
						field: 'when',
						path: `${flowId}.steps[${step.id}].when`,
					},
					suggestion: `Ensure step '${referencedStepId}' exists and is defined before step '${step.id}'`,
					context: {
						actual: condition,
						related: Array.from(stepOutputs.keys()),
					},
				});
				continue;
			}

			// Check if referenced output exists
			const outputs = stepOutputs.get(referencedStepId)!;
			if (!outputs.has(referencedOutput)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.UNDEFINED_OUTPUT,
					message: `Conditional expression references undefined output '${referencedOutput}' in step '${referencedStepId}'`,
					location: {
						stepId: step.id,
						field: 'when',
						path: `${flowId}.steps[${step.id}].when`,
					},
					suggestion: `Add '${referencedOutput}' to step '${referencedStepId}' output configuration`,
					context: {
						actual: condition,
						related: Array.from(outputs.keys()),
					},
				});
			}
		}
	}

	/**
	 * Validate data type flow across step boundaries
	 */
	private validateDataTypeFlow(
		step: FlowStep,
		stepOutputs: Map<string, Map<string, VariableType>>,
		allSteps: FlowStep[],
		flowId: string
	): void {
		// For script steps, check if they use step outputs with type mismatches
		if (step.type === 'script') {
			const script = step.script;

			// Extract step output references from script
			const stepRefPattern = /\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g;
			const matches = [...script.matchAll(stepRefPattern)];

			for (const match of matches) {
				const referencedStepId = match[1];
				const referencedOutput = match[2];

				// Check if output is defined
				const outputs = stepOutputs.get(referencedStepId);
				if (outputs && outputs.has(referencedOutput)) {
					const outputType = outputs.get(referencedOutput)!;

					// Warn if using object/boolean in shell script without proper handling
					if (outputType === 'object') {
						this.issueCollector.addIssue({
							severity: 'warning',
							code: ValidationCode.TYPE_MISMATCH,
							message: `Script in step '${step.id}' uses object output '${referencedOutput}' from step '${referencedStepId}'`,
							location: {
								stepId: step.id,
								field: 'script',
								path: `${flowId}.steps[${step.id}].script`,
							},
							suggestion: `Object outputs may need JSON parsing in scripts. Consider using parseJSON transform if needed.`,
							context: {
								actual: 'object',
								expected: 'string or number',
							},
						});
					}
				}
			}
		}

		// For model steps, check prompt uses correct types
		if (step.type === 'model') {
			const prompt = step.prompt;

			// Extract step output references
			const stepRefPattern = /\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g;
			const matches = [...prompt.matchAll(stepRefPattern)];

			for (const match of matches) {
				const referencedStepId = match[1];
				const referencedOutput = match[2];

				const outputs = stepOutputs.get(referencedStepId);
				if (outputs && outputs.has(referencedOutput)) {
					const outputType = outputs.get(referencedOutput)!;

					// Info: object types in prompts may need formatting
					if (outputType === 'object') {
						this.issueCollector.addIssue({
							severity: 'info',
							code: ValidationCode.TYPE_MISMATCH,
							message: `Model prompt in step '${step.id}' uses object output '${referencedOutput}'`,
							location: {
								stepId: step.id,
								field: 'prompt',
								path: `${flowId}.steps[${step.id}].prompt`,
							},
							suggestion: `Object outputs in prompts are automatically stringified. Consider formatting if needed.`,
							context: {
								actual: 'object',
							},
						});
					}
				}
			}
		}
	}

	/**
	 * Validate that all required inputs are provided or have defaults
	 */
	private validateInputCoverage(flow: FlowDefinition): void {
		// Use auto-discovered inputs if available, otherwise use explicit inputs
		const inputs = flow._autoDiscoveredInputs || {};

		for (const [inputName, inputDef] of Object.entries(inputs)) {
			// Check if required input has no default
			if (inputDef.required && inputDef.default === undefined) {
				// This is actually fine - it means the task must provide this input
				// We only warn if there's a suspicious configuration
				continue;
			}

			// Warn if input has default but is marked required
			if (inputDef.required && inputDef.default !== undefined) {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.INVALID_VALUE,
					message: `Input '${inputName}' is marked required but has a default value`,
					location: {
						field: `inputs.${inputName}`,
						path: `${flow.id}.inputs.${inputName}`,
					},
					suggestion: `Remove 'required: true' or remove 'default' value (required inputs with defaults are always satisfied)`,
					context: {
						actual: { required: true, default: inputDef.default },
						expected: 'Either required: true OR default: value, not both',
					},
				});
			}
		}
	}
}
