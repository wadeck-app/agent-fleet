/**
 * Semantic Validator
 *
 * Validates semantic correctness of flow definitions:
 * - Step dependency references (depends field)
 * - previousOutputs references in step context
 * - onFailure.goto references and configuration
 * - skipOnLoop flags
 * - Subflow references and input mappings
 * - Subflow workspaceStrategy validation
 * - allowRecursion flag usage
 *
 * This validator assumes the flow has already passed schema validation,
 * so basic structure (step IDs, types) is guaranteed to be valid.
 */
import type { FlowRegistry } from '../registry/FlowRegistry';
import type { FlowDefinition, FlowStep, SubFlowStep, WorkspaceStrategy } from '../types';
import type { GraphValidator } from './GraphValidator';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Semantic Validator - validates semantic correctness of flows
 */
export class SemanticValidator {
	/**
	 * Create a new SemanticValidator
	 * @param issueCollector - Collector for validation issues
	 * @param graphValidator - Graph validator for circular subflow checks
	 * @param flowRegistry - Optional registry for subflow validation
	 */
	constructor(
		private issueCollector: IssueCollector,
		private graphValidator: GraphValidator,
		private flowRegistry?: FlowRegistry
	) {}

	/**
	 * Validate semantic correctness of a flow
	 * This is the main entry point for semantic validation
	 *
	 * @param flow - Flow definition to validate
	 * @param stepIds - Set of valid step IDs (from schema validation)
	 */
	public validateSemantics(flow: FlowDefinition, stepIds: Set<string>): void {
		// Validate step references (next, conditions, previousOutputs)
		this.validateStepReferences(flow.steps, stepIds);

		// Validate subflow references and configuration
		for (const step of flow.steps) {
			if (step.type === 'subflow') {
				this.validateSubFlowReferences(step as SubFlowStep, flow.id, stepIds);
			}
		}
	}

	/**
	 * Validate step references (depends, previousOutputs, onFailure.goto)
	 *
	 * @param steps - Flow steps to validate
	 * @param stepIds - Set of valid step IDs
	 */
	private validateStepReferences(steps: FlowStep[], stepIds: Set<string>): void {
		for (const step of steps) {
			// Validate depends
			if (step.depends) {
				for (let i = 0; i < step.depends.length; i++) {
					const depId = step.depends[i];
					if (!stepIds.has(depId)) {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.UNDEFINED_STEP,
							message: `Step '${step.id}' depends on non-existent step: ${depId}`,
							location: { stepId: step.id, field: `depends[${i}]` },
							suggestion: `Choose an existing step: ${Array.from(stepIds).join(', ')}`,
							context: {
								actual: depId,
								related: Array.from(stepIds),
							},
						});
					}
				}
			}

			// Validate previousOutputs
			if (step.context?.previousOutputs) {
				for (const refStepId of step.context.previousOutputs) {
					if (!stepIds.has(refStepId)) {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.UNDEFINED_STEP,
							message: `Step '${step.id}' references non-existent step in previousOutputs: ${refStepId}`,
							location: { stepId: step.id, field: 'context.previousOutputs' },
							suggestion: `Choose an existing step: ${Array.from(stepIds).join(', ')}`,
							context: {
								actual: refStepId,
								related: Array.from(stepIds),
							},
						});
					}
				}
			}

			// Validate onFailure.goto (feedback loops)
			if (step.onFailure?.goto) {
				const targetStepId = step.onFailure.goto;
				if (!stepIds.has(targetStepId)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.UNDEFINED_STEP,
						message: `Step '${step.id}' has onFailure.goto referencing non-existent step: ${targetStepId}`,
						location: { stepId: step.id, field: 'onFailure.goto' },
						suggestion: `Choose an existing step: ${Array.from(stepIds).join(', ')}`,
						context: {
							actual: targetStepId,
							related: Array.from(stepIds),
						},
					});
				}

				// Validate maxIterations (optional, but should be positive if present)
				if (step.onFailure.maxIterations !== undefined) {
					const maxIter = step.onFailure.maxIterations;
					if (typeof maxIter !== 'number' || maxIter < 1) {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.INVALID_VALUE,
							message: `Step '${step.id}' has invalid onFailure.maxIterations: ${maxIter}`,
							location: { stepId: step.id, field: 'onFailure.maxIterations' },
							suggestion: 'maxIterations must be a positive integer (default: 3)',
							context: {
								actual: maxIter,
								expected: 'positive integer',
							},
						});
					}
				}

				// Validate resetOnSuccess (optional, but should be boolean if present)
				if (step.onFailure.resetOnSuccess !== undefined) {
					if (typeof step.onFailure.resetOnSuccess !== 'boolean') {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.INVALID_TYPE,
							message: `Step '${step.id}' has invalid onFailure.resetOnSuccess type`,
							location: { stepId: step.id, field: 'onFailure.resetOnSuccess' },
							suggestion: 'resetOnSuccess must be a boolean (true or false)',
							context: {
								actual: typeof step.onFailure.resetOnSuccess,
								expected: 'boolean',
							},
						});
					}
				}
			}

			// Validate skipOnLoop (optional, but should be boolean if present)
			if (step.skipOnLoop !== undefined && typeof step.skipOnLoop !== 'boolean') {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_TYPE,
					message: `Step '${step.id}' has invalid skipOnLoop type`,
					location: { stepId: step.id, field: 'skipOnLoop' },
					suggestion: 'skipOnLoop must be a boolean (true or false)',
					context: {
						actual: typeof step.skipOnLoop,
						expected: 'boolean',
					},
				});
			}
		}
	}

	/**
	 * Validate subflow references and configuration
	 *
	 * This validates:
	 * - Circular subflow dependencies (via GraphValidator)
	 * - Flow existence in registry
	 * - Input mappings match target flow inputs
	 * - workspaceStrategy is valid
	 * - allowRecursion flag is used correctly
	 *
	 * @param step - SubFlow step to validate
	 * @param currentFlowId - ID of the flow containing this step
	 * @param stepIds - Set of valid step IDs (for context)
	 */
	private validateSubFlowReferences(step: SubFlowStep, currentFlowId: string, stepIds: Set<string>): void {
		// Check for circular references FIRST (before checking if flow exists)
		// This is important because a flow might reference itself before it's registered
		const isCircular = this.graphValidator.validateSubFlowCircularity(step, currentFlowId);
		if (isCircular) {
			return; // No point checking further for circular flows
		}

		// Now validate flowId references an existing flow (if registry is available)
		// Skip this check for self-references (already handled by GraphValidator)
		if (this.flowRegistry && step.flowId !== currentFlowId) {
			if (!this.flowRegistry.hasFlow(step.flowId)) {
				const availableFlows = this.flowRegistry.getFlowIds();
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.UNDEFINED_FLOW,
					message: `SubFlow step '${step.id}' references non-existent flow '${step.flowId}'`,
					location: { stepId: step.id, field: 'flowId' },
					suggestion:
						availableFlows.length > 0
							? `Available flows: ${availableFlows.join(', ')}`
							: 'No flows are currently registered',
					context: {
						actual: step.flowId,
						related: availableFlows,
					},
				});
				return; // Can't validate inputs without the flow
			}

			// Validate required inputs are provided
			const referencedFlow = this.flowRegistry.getFlow(step.flowId);
			if (referencedFlow && referencedFlow.inputs) {
				const providedInputs = Object.keys(step.inputs || {});
				const requiredInputs = Object.keys(referencedFlow.inputs);

				for (const inputKey of requiredInputs) {
					if (!providedInputs.includes(inputKey)) {
						this.issueCollector.addIssue({
							severity: 'warning',
							code: ValidationCode.MISSING_FIELD,
							message: `SubFlow step '${step.id}' missing required input '${inputKey}' for flow '${step.flowId}'`,
							location: { stepId: step.id, field: 'inputs' },
							suggestion: `Add input mapping: inputs.${inputKey}`,
							context: {
								expected: requiredInputs,
								actual: providedInputs,
							},
						});
					}
				}
			}
		}

		// Validate workspaceStrategy (optional, but should be valid if present)
		if (step.workspaceStrategy !== undefined) {
			const validStrategies: WorkspaceStrategy[] = ['inherit', 'separate'];
			if (!validStrategies.includes(step.workspaceStrategy)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_VALUE,
					message: `SubFlow step '${step.id}' has invalid workspaceStrategy: ${step.workspaceStrategy}`,
					location: { stepId: step.id, field: 'workspaceStrategy' },
					suggestion: `Must be one of: ${validStrategies.join(', ')}`,
					context: {
						actual: step.workspaceStrategy,
						expected: validStrategies,
						related: validStrategies,
					},
				});
			}
		}

		// Validate inputs is an object
		if (step.inputs !== undefined && typeof step.inputs !== 'object') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `SubFlow step '${step.id}' inputs must be an object`,
				location: { stepId: step.id, field: 'inputs' },
				context: {
					expected: 'object',
					actual: typeof step.inputs,
				},
			});
		}

		// Validate allowRecursion flag is only used when actually recursive
		if (step.allowRecursion === true && step.flowId !== currentFlowId) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `SubFlow step '${step.id}' has allowRecursion=true but does not call itself (flowId='${step.flowId}')`,
				location: { stepId: step.id, field: 'allowRecursion' },
				suggestion: 'Remove the unnecessary allowRecursion flag or fix the flowId if recursion was intended',
			});
		}
	}
}
