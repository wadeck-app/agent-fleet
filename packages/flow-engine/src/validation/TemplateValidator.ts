/**
 * Template Validator
 *
 * Validates template expressions in flow definitions.
 * Extracts and validates variable references from:
 * - ModelFlowStep prompts
 * - ScriptFlowStep scripts
 * - SubFlowStep inputs
 *
 * Validates references to:
 * - inputs.* (flow inputs)
 * - steps.*.outputs.* (step outputs)
 * - task.* (task metadata)
 *
 * Supports auto-discovery of inputs: undeclared inputs referenced in templates
 * can be automatically discovered and added as optional string inputs.
 */
import type { FlowDefinition, NormalizedInputDefinition } from '../types';
import { type IssueCollector, ValidationCode, type VariableReference } from './ValidationTypes';

/**
 * Validates template expressions and variable references in flows
 */
export class TemplateValidator {
	private autoDiscoveredInputs: Map<string, NormalizedInputDefinition> = new Map();
	private enableAutoDiscovery: boolean;

	/**
	 * Create a new TemplateValidator
	 * @param issueCollector - Collector for validation issues
	 * @param enableAutoDiscovery - Whether to auto-discover undeclared inputs (default: true)
	 */
	constructor(
		private issueCollector: IssueCollector,
		enableAutoDiscovery: boolean = true
	) {
		this.enableAutoDiscovery = enableAutoDiscovery;
	}

	/**
	 * Get auto-discovered inputs
	 * @returns Map of input names to normalized definitions
	 */
	public getAutoDiscoveredInputs(): Map<string, NormalizedInputDefinition> {
		return this.autoDiscoveredInputs;
	}

	/**
	 * Validate all template variables in the flow
	 *
	 * @param flow - Flow definition to validate
	 * @param stepIds - Set of valid step IDs (from SchemaValidator)
	 * @param inputNames - Set of valid input names (from SchemaValidator)
	 */
	public validateTemplates(flow: FlowDefinition, stepIds: Set<string>, inputNames: Set<string>): void {
		// Collect all variable references from templates
		const references = this.extractVariableReferences(flow);

		// Validate each reference
		for (const ref of references) {
			this.validateReference(ref, flow, stepIds, inputNames);
		}
	}

	/**
	 * Extract all variable references from templates
	 *
	 * Scans all steps for ${{ ... }} template expressions and parses them
	 * into structured variable references.
	 *
	 * @param flow - Flow definition to scan
	 * @returns Array of variable references found
	 */
	private extractVariableReferences(flow: FlowDefinition): VariableReference[] {
		const references: VariableReference[] = [];

		// Template regex: ${{ ... }}
		const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;

		for (const step of flow.steps) {
			let text = '';
			let fieldName = '';

			// Get text to scan based on step type
			if (step.type === 'model') {
				text = step.prompt || '';
				fieldName = 'prompt';
			} else if (step.type === 'script') {
				text = step.script || '';
				fieldName = 'script';
			} else if (step.type === 'subflow') {
				// Scan SubFlowStep inputs (values, not keys)
				// This was missing and is a critical fix for auto-discovery
				for (const [inputKey, inputValue] of Object.entries(step.inputs || {})) {
					if (typeof inputValue === 'string') {
						let match;
						const regex = new RegExp(templateRegex.source, templateRegex.flags);
						while ((match = regex.exec(inputValue)) !== null) {
							const expression = match[1].trim();
							const parsed = this.parseVariableExpression(expression);

							if (parsed) {
								references.push({
									expression,
									type: parsed.type,
									path: parsed.path,
									location: {
										stepId: step.id,
										field: `inputs.${inputKey}`,
									},
								});
							}
						}
					}
				}
				continue; // Skip the text scanning below for subflow steps
			}

			// Find all template expressions in text
			if (text) {
				let match;
				while ((match = templateRegex.exec(text)) !== null) {
					const expression = match[1].trim();
					const parsed = this.parseVariableExpression(expression);

					if (parsed) {
						references.push({
							expression,
							type: parsed.type,
							path: parsed.path,
							location: {
								stepId: step.id,
								field: fieldName,
							},
						});
					}
				}
			}
		}

		return references;
	}

	/**
	 * Parse a variable expression into its components
	 *
	 * Examples:
	 * - "inputs.foo" → { type: 'input', path: ['foo'] }
	 * - "steps.bar.outputs.baz" → { type: 'step', path: ['bar', 'outputs', 'baz'] }
	 * - "task.priority" → { type: 'task', path: ['priority'] }
	 *
	 * @param expression - Variable expression to parse
	 * @returns Parsed expression or null if invalid format
	 */
	private parseVariableExpression(expression: string): { type: 'input' | 'step' | 'task'; path: string[] } | null {
		const parts = expression.split('.');

		if (parts[0] === 'inputs') {
			return { type: 'input', path: parts.slice(1) };
		} else if (parts[0] === 'steps') {
			return { type: 'step', path: parts.slice(1) };
		} else if (parts[0] === 'task') {
			return { type: 'task', path: parts.slice(1) };
		}

		return null;
	}

	/**
	 * Validate a single variable reference
	 *
	 * @param ref - Variable reference to validate
	 * @param flow - Flow definition for looking up step configurations
	 * @param stepIds - Set of valid step IDs
	 * @param inputNames - Set of valid input names
	 */
	private validateReference(
		ref: VariableReference,
		flow: FlowDefinition,
		stepIds: Set<string>,
		inputNames: Set<string>
	): void {
		if (ref.type === 'input') {
			// Validate input reference
			const inputName = ref.path[0];
			if (!inputNames.has(inputName)) {
				// Check if auto-discovery is enabled
				if (this.enableAutoDiscovery) {
					// Auto-discover this input if not already discovered
					if (!this.autoDiscoveredInputs.has(inputName)) {
						this.autoDiscoveredInputs.set(inputName, {
							type: 'string',
							required: false,
							source: 'auto-discovered',
						});

						// Log info issue (not error) to inform the user
						this.issueCollector.addIssue({
							severity: 'info',
							code: ValidationCode.AUTO_DISCOVERED_INPUT,
							message: `Auto-discovered input '${inputName}' from template reference: ${ref.expression}`,
							location: ref.location,
							suggestion: `Consider explicitly declaring this input in the flow definition for better documentation`,
							context: {
								actual: inputName,
								related: Array.from(inputNames),
							},
						});
					}
				} else {
					// Auto-discovery disabled - report as error
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.UNDEFINED_INPUT,
						message: `Reference to undefined input: ${ref.expression}`,
						location: ref.location,
						suggestion: `Define input '${inputName}' or use an existing one: ${Array.from(inputNames).join(', ')}`,
						context: {
							actual: inputName,
							related: Array.from(inputNames),
						},
					});
				}
			}
		} else if (ref.type === 'step') {
			// Validate step output reference
			const stepId = ref.path[0];
			if (!stepIds.has(stepId)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.UNDEFINED_STEP,
					message: `Reference to undefined step: ${ref.expression}`,
					location: ref.location,
					suggestion: `Use an existing step: ${Array.from(stepIds).join(', ')}`,
					context: {
						actual: stepId,
						related: Array.from(stepIds),
					},
				});
			} else if (ref.path.length >= 3 && ref.path[1] === 'outputs') {
				// Validate that the output field is defined in the step's output config
				const outputVarName = ref.path[2];
				const sourceStep = flow.steps.find(s => s.id === stepId);

				if (sourceStep && sourceStep.output) {
					// Step has output config - check if the variable is defined
					if (!sourceStep.output[outputVarName]) {
						const availableOutputs = Object.keys(sourceStep.output);
						this.issueCollector.addIssue({
							severity: 'warning',
							code: ValidationCode.UNDEFINED_OUTPUT,
							message: `Reference to undefined output: ${ref.expression}. Step '${stepId}' does not define output '${outputVarName}'`,
							location: ref.location,
							suggestion:
								availableOutputs.length > 0
									? `Add output definition to step '${stepId}' or use an existing output: ${availableOutputs.join(', ')}`
									: `Add output definition for '${outputVarName}' to step '${stepId}'`,
							context: {
								actual: outputVarName,
								related: availableOutputs,
							},
						});
					}
				} else if (sourceStep && !sourceStep.output) {
					// Step exists but has no output config at all
					this.issueCollector.addIssue({
						severity: 'warning',
						code: ValidationCode.MISSING_OUTPUT,
						message: `Reference to output from step with no output config: ${ref.expression}`,
						location: ref.location,
						suggestion: `Add 'output' configuration to step '${stepId}' to define available outputs`,
					});
				}
			}
		} else if (ref.type === 'task') {
			// Task metadata is dynamic, so we just validate basic structure
			const validTaskFields = ['priority', 'metadata', 'id', 'createdAt'];
			const field = ref.path[0];
			if (!validTaskFields.includes(field) && field !== 'metadata') {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.UNDEFINED_VARIABLE,
					message: `Possible undefined task field: ${ref.expression}`,
					location: ref.location,
					suggestion: `Common task fields: ${validTaskFields.join(', ')}`,
					context: {
						actual: field,
						related: validTaskFields,
					},
				});
			}
		}
	}
}
