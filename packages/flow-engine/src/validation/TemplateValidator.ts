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
 */
import type { FlowDefinition } from '../types';
import { type IssueCollector, ValidationCode, type VariableReference } from './ValidationTypes';

/**
 * Validates template expressions and variable references in flows
 */
export class TemplateValidator {
	constructor(private issueCollector: IssueCollector) {}

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
			this.validateReference(ref, stepIds, inputNames);
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

			// Get text to scan based on step type
			if (step.type === 'model') {
				text = step.prompt || '';
			} else if (step.type === 'script') {
				text = step.script || '';
			}

			// Find all template expressions
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
							field: step.type === 'model' ? 'prompt' : 'script',
						},
					});
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
	 * @param stepIds - Set of valid step IDs
	 * @param inputNames - Set of valid input names
	 */
	private validateReference(ref: VariableReference, stepIds: Set<string>, inputNames: Set<string>): void {
		if (ref.type === 'input') {
			// Validate input reference
			const inputName = ref.path[0];
			if (!inputNames.has(inputName)) {
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
			}
			// Note: We can't validate output field without execution, so we skip that
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
