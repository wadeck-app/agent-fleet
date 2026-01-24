/**
 * Contract Validator
 *
 * Validates step contracts (pre-process and post-process conditions):
 * - Pre-process validation (input contracts)
 * - Post-process validation (output contracts)
 * - Validation rule consistency
 * - Required field declarations
 *
 * This validator ensures that contract configurations are valid and will work at runtime.
 */
import type { FlowDefinition, FlowStep, ValidationRule, VariableType } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Valid validation rule types for each variable type
 */
const VALID_RULES_BY_TYPE: Partial<Record<VariableType, Set<string>>> = {
	// Base types
	string: new Set(['required', 'pattern', 'minLength', 'maxLength', 'enum', 'custom']),
	number: new Set(['required', 'min', 'max', 'enum', 'custom']),
	boolean: new Set(['required', 'custom']),
	object: new Set(['required', 'custom']),
	// Text types (similar to string)
	text: new Set(['required', 'pattern', 'minLength', 'maxLength', 'custom']),
	url: new Set(['required', 'pattern', 'custom']),
	markdown: new Set(['required', 'minLength', 'maxLength', 'custom']),
	// Number types (similar to number)
	integer: new Set(['required', 'min', 'max', 'enum', 'custom']),
	percentage: new Set(['required', 'min', 'max', 'custom']),
	duration: new Set(['required', 'min', 'max', 'custom']),
	// Selection types
	enum: new Set(['required', 'enum', 'custom']),
	'multi-enum': new Set(['required', 'enum', 'custom']),
	// File types
	file: new Set(['required', 'custom']),
	folder: new Set(['required', 'custom']),
	// Date types
	date: new Set(['required', 'custom']),
	datetime: new Set(['required', 'custom']),
	// Code types
	regex: new Set(['required', 'pattern', 'custom']),
	// Structure types
	array: new Set(['required', 'minLength', 'maxLength', 'custom']),
	keyvalue: new Set(['required', 'custom']),
	// Security types
	password: new Set(['required', 'minLength', 'maxLength', 'pattern', 'custom']),
	// Business types
	priority: new Set(['required', 'enum', 'custom']),
};

/**
 * Contract Validator
 */
export class ContractValidator {
	/**
	 * Create a new ContractValidator
	 * @param issueCollector - Collector for validation issues
	 */
	constructor(private issueCollector: IssueCollector) {}

	/**
	 * Validate step contracts
	 * @param flow - Flow definition to validate
	 * @param stepIds - Set of valid step IDs
	 */
	public validateContracts(flow: FlowDefinition, _stepIds: Set<string>): void {
		// Build input and output type maps
		const inputTypes = this.buildInputTypeMap(flow);
		const stepOutputTypes = this.buildStepOutputTypeMap(flow.steps);

		// Validate each step's contract
		for (const step of flow.steps) {
			if (step.contract) {
				// Validate pre-process (input validation)
				if (step.contract.preProcess) {
					this.validatePreProcess(step, inputTypes, stepOutputTypes, flow.id);
				}

				// Validate post-process (output validation)
				if (step.contract.postProcess) {
					this.validatePostProcess(step, flow.id);
				}
			}
		}
	}

	/**
	 * Build a map of input types
	 */
	private buildInputTypeMap(flow: FlowDefinition): Map<string, VariableType> {
		const inputTypes = new Map<string, VariableType>();

		// Use auto-discovered inputs if available
		const inputs = flow._autoDiscoveredInputs || {};

		for (const [inputName, inputDef] of Object.entries(inputs)) {
			inputTypes.set(inputName, inputDef.type);
		}

		return inputTypes;
	}

	/**
	 * Build a map of step output types
	 */
	private buildStepOutputTypeMap(steps: FlowStep[]): Map<string, Map<string, VariableType>> {
		const stepOutputTypes = new Map<string, Map<string, VariableType>>();

		for (const step of steps) {
			if (step.output) {
				const outputs = new Map<string, VariableType>();

				for (const [varName, config] of Object.entries(step.output)) {
					// Handle OutputVariableConfig
					if (typeof config === 'object' && 'type' in config) {
						outputs.set(varName, config.type);
					}
				}

				stepOutputTypes.set(step.id, outputs);
			}
		}

		return stepOutputTypes;
	}

	/**
	 * Validate pre-process (input) contract
	 */
	private validatePreProcess(
		step: FlowStep,
		inputTypes: Map<string, VariableType>,
		stepOutputTypes: Map<string, Map<string, VariableType>>,
		flowId: string
	): void {
		const preProcess = step.contract!.preProcess!;

		// Validate validateInputs section
		if (preProcess.validateInputs) {
			for (const [varName, rules] of Object.entries(preProcess.validateInputs)) {
				// Determine if this is a flow input or step output reference
				let varType: VariableType | undefined;
				let varSource: string;

				// Check if it's a flow input
				if (inputTypes.has(varName)) {
					varType = inputTypes.get(varName);
					varSource = 'input';
				} else {
					// Check if it's a step output reference (format: stepId.outputName)
					const parts = varName.split('.');
					if (parts.length === 2) {
						const [stepId, outputName] = parts;
						const stepOutputs = stepOutputTypes.get(stepId);
						if (stepOutputs) {
							varType = stepOutputs.get(outputName);
							// varSource = `step ${stepId} output`; // Future: could be used for better error messages
						}
					}
				}

				// If variable not found, report error
				if (!varType) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.UNDEFINED_VARIABLE,
						message: `Pre-process contract validates unknown variable '${varName}' in step '${step.id}'`,
						location: {
							stepId: step.id,
							field: `contract.preProcess.validateInputs.${varName}`,
							path: `${flowId}.steps[${step.id}].contract.preProcess.validateInputs.${varName}`,
						},
						suggestion: `Ensure '${varName}' is defined as a flow input or step output`,
						context: {
							actual: varName,
							related: Array.from(inputTypes.keys()),
						},
					});
					continue;
				}

				// Validate rules for this variable
				this.validateRulesForType(step, varName, varType, rules, 'preProcess', flowId);
			}
		}

		// Validate required section
		if (preProcess.required) {
			for (const varName of preProcess.required) {
				// Check if variable exists
				if (!inputTypes.has(varName)) {
					// Check if it's a step output
					const parts = varName.split('.');
					if (parts.length === 2) {
						const [stepId, outputName] = parts;
						const stepOutputs = stepOutputTypes.get(stepId);
						if (!stepOutputs || !stepOutputs.has(outputName)) {
							this.issueCollector.addIssue({
								severity: 'error',
								code: ValidationCode.UNDEFINED_VARIABLE,
								message: `Pre-process contract requires unknown variable '${varName}' in step '${step.id}'`,
								location: {
									stepId: step.id,
									field: `contract.preProcess.required`,
									path: `${flowId}.steps[${step.id}].contract.preProcess.required`,
								},
								suggestion: `Ensure '${varName}' is defined as a flow input or step output`,
							});
						}
					} else {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.UNDEFINED_INPUT,
							message: `Pre-process contract requires unknown input '${varName}' in step '${step.id}'`,
							location: {
								stepId: step.id,
								field: `contract.preProcess.required`,
								path: `${flowId}.steps[${step.id}].contract.preProcess.required`,
							},
							suggestion: `Add '${varName}' to flow inputs or use step output reference (stepId.outputName)`,
						});
					}
				}
			}
		}
	}

	/**
	 * Validate post-process (output) contract
	 */
	private validatePostProcess(step: FlowStep, flowId: string): void {
		const postProcess = step.contract!.postProcess!;

		// Check if step has output configuration
		if (!step.output) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `Step '${step.id}' has post-process contract but no output configuration`,
				location: {
					stepId: step.id,
					field: 'output',
					path: `${flowId}.steps[${step.id}].output`,
				},
				suggestion: `Add output configuration to step '${step.id}' or remove post-process contract`,
			});
			return;
		}

		// Build output type map
		const outputTypes = new Map<string, VariableType>();
		for (const [varName, config] of Object.entries(step.output)) {
			if (typeof config === 'object' && 'type' in config) {
				outputTypes.set(varName, config.type);
			}
		}

		// Validate validateOutputs section
		if (postProcess.validateOutputs) {
			for (const [varName, rules] of Object.entries(postProcess.validateOutputs)) {
				// Check if output is defined
				const varType = outputTypes.get(varName);

				if (!varType) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.UNDEFINED_OUTPUT,
						message: `Post-process contract validates undefined output '${varName}' in step '${step.id}'`,
						location: {
							stepId: step.id,
							field: `contract.postProcess.validateOutputs.${varName}`,
							path: `${flowId}.steps[${step.id}].contract.postProcess.validateOutputs.${varName}`,
						},
						suggestion: `Add '${varName}' to step output configuration`,
						context: {
							actual: varName,
							related: Array.from(outputTypes.keys()),
						},
					});
					continue;
				}

				// Validate rules for this output
				this.validateRulesForType(step, varName, varType, rules, 'postProcess', flowId);
			}
		}

		// Validate required section
		if (postProcess.required) {
			for (const varName of postProcess.required) {
				if (!outputTypes.has(varName)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.UNDEFINED_OUTPUT,
						message: `Post-process contract requires undefined output '${varName}' in step '${step.id}'`,
						location: {
							stepId: step.id,
							field: `contract.postProcess.required`,
							path: `${flowId}.steps[${step.id}].contract.postProcess.required`,
						},
						suggestion: `Add '${varName}' to step output configuration`,
					});
				}
			}
		}
	}

	/**
	 * Validate that validation rules are appropriate for the variable type
	 */
	private validateRulesForType(
		step: FlowStep,
		varName: string,
		varType: VariableType,
		rules: ValidationRule[],
		phase: 'preProcess' | 'postProcess',
		flowId: string
	): void {
		const validRules = VALID_RULES_BY_TYPE[varType];

		// If variable type has no specific validation rules defined, allow all rules
		if (!validRules) {
			// Validate rule values but don't restrict rule types for unknown types
			for (const rule of rules) {
				this.validateRuleValue(step, varName, varType, rule, phase, flowId);
			}
			return;
		}

		for (const rule of rules) {
			// Check if rule type is valid for this variable type
			if (!validRules.has(rule.type)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_TYPE,
					message: `Validation rule '${rule.type}' is not valid for ${varType} variable '${varName}' in step '${step.id}'`,
					location: {
						stepId: step.id,
						field: `contract.${phase}.validateInputs.${varName}`,
						path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`,
					},
					suggestion: `Valid rules for ${varType}: ${Array.from(validRules).join(', ')}`,
					context: {
						actual: rule.type,
						expected: Array.from(validRules),
					},
				});
			}

			// Validate rule-specific constraints
			this.validateRuleValue(step, varName, varType, rule, phase, flowId);
		}
	}

	/**
	 * Validate rule value constraints
	 */
	private validateRuleValue(
		step: FlowStep,
		varName: string,
		varType: VariableType,
		rule: ValidationRule,
		phase: 'preProcess' | 'postProcess',
		flowId: string
	): void {
		// Pattern rule must have a string value
		if (rule.type === 'pattern' && typeof rule.value !== 'string') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `Pattern rule for '${varName}' must have a string value`,
				location: {
					stepId: step.id,
					field: `contract.${phase}.validateInputs.${varName}`,
					path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`,
				},
				suggestion: `Provide a regex pattern string (e.g., "^[a-z]+$")`,
			});
		}

		// Min/max rules must have numeric values
		if ((rule.type === 'min' || rule.type === 'max') && typeof rule.value !== 'number') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `${rule.type} rule for '${varName}' must have a numeric value`,
				location: {
					stepId: step.id,
					field: `contract.${phase}.validateInputs.${varName}`,
					path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`,
				},
				suggestion: `Provide a number value`,
			});
		}

		// minLength/maxLength rules must have numeric values
		if ((rule.type === 'minLength' || rule.type === 'maxLength') && typeof rule.value !== 'number') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `${rule.type} rule for '${varName}' must have a numeric value`,
				location: {
					stepId: step.id,
					field: `contract.${phase}.validateInputs.${varName}`,
					path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`,
				},
				suggestion: `Provide a number value`,
			});
		}

		// Enum rule must have an array value
		if (rule.type === 'enum' && !Array.isArray(rule.value)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `Enum rule for '${varName}' must have an array value`,
				location: {
					stepId: step.id,
					field: `contract.${phase}.validateInputs.${varName}`,
					path: `${flowId}.steps[${step.id}].contract.${phase}.validateInputs.${varName}`,
				},
				suggestion: `Provide an array of valid values (e.g., ["low", "medium", "high"])`,
			});
		}
	}
}
