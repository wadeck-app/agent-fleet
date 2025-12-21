/**
 * Schema Validator
 *
 * Validates the structural integrity of flow definitions:
 * - Flow metadata (id, name, description, version)
 * - Workspace configuration structure
 * - Status transitions structure
 * - Input definitions and types
 * - Step structure and type-specific fields
 * - Step ID uniqueness and presence
 *
 * This validator focuses on STRUCTURE, not semantics (e.g., it doesn't validate
 * that step references are valid - that's done by other validators).
 */
import { TaskStatus } from 'shared-common/types.js';

import type {
	FlowDefinition,
	FlowStep,
	GitStrategy,
	ModelFlowStep,
	ModelType,
	ReusePolicy,
	ScriptFlowStep,
	SubFlowStep,
	VariableType,
	WorkspaceMode,
	WorkspaceStrategy,
} from '../types.js';
import type { IssueCollector } from './ValidationTypes.js';
import { ValidationCode } from './ValidationTypes.js';

/**
 * Schema Validator
 */
export class SchemaValidator {
	/**
	 * Create a new SchemaValidator
	 * @param issueCollector - Collector for validation issues
	 */
	constructor(private issueCollector: IssueCollector) {}

	/**
	 * Validate flow schema
	 * @param flow - Flow definition to validate
	 * @returns Set of step IDs found in the flow
	 */
	public validateSchema(flow: FlowDefinition): Set<string> {
		// Validate flow ID
		if (!flow.id || typeof flow.id !== 'string' || flow.id.trim() === '') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow must have a non-empty ID',
				location: { field: 'id' },
				suggestion: 'Add a unique identifier for this flow (e.g., "my-flow")',
			});
		}

		// Validate flow name
		if (!flow.name || typeof flow.name !== 'string') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow must have a name',
				location: { field: 'name' },
				suggestion: 'Add a descriptive name for this flow',
			});
		}

		// Validate description
		if (!flow.description || typeof flow.description !== 'string') {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow should have a description',
				location: { field: 'description' },
				suggestion: 'Add a description to help users understand the flow purpose',
			});
		}

		// Validate workspace config
		this.validateWorkspaceConfig(flow.workspace, flow.id);

		// Validate status transitions (optional)
		if (flow.statusTransitions) {
			this.validateStatusTransitions(flow.statusTransitions, flow.id);
		}

		// Validate inputs
		this.validateInputs(flow.inputs, flow.id);

		// Validate steps and return step IDs
		return this.validateSteps(flow.steps, flow.id);
	}

	/**
	 * Validate workspace configuration
	 */
	private validateWorkspaceConfig(config: any, flowId: string): void {
		if (!config) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow must have workspace configuration',
				location: { field: 'workspace' },
				suggestion: 'Add workspace configuration with mode, gitStrategy, and reusePolicy',
			});
			return;
		}

		// Validate mode
		const validModes: WorkspaceMode[] = ['isolated', 'shared', 'manual'];
		if (!config.mode) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Workspace must have a mode',
				location: { field: 'workspace.mode' },
				suggestion: `Choose one of: ${validModes.join(', ')}`,
				context: { related: validModes },
			});
		} else if (!validModes.includes(config.mode)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid workspace mode: ${config.mode}`,
				location: { field: 'workspace.mode' },
				suggestion: `Must be one of: ${validModes.join(', ')}`,
				context: {
					actual: config.mode,
					expected: validModes,
					related: validModes,
				},
			});
		}

		// Validate git strategy
		const validStrategies: GitStrategy[] = ['main-only', 'feature-branch', 'any', 'worktree'];
		if (!config.gitStrategy) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Workspace must have a git strategy',
				location: { field: 'workspace.gitStrategy' },
				suggestion: `Choose one of: ${validStrategies.join(', ')}`,
				context: { related: validStrategies },
			});
		} else if (!validStrategies.includes(config.gitStrategy)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid git strategy: ${config.gitStrategy}`,
				location: { field: 'workspace.gitStrategy' },
				suggestion: `Must be one of: ${validStrategies.join(', ')}`,
				context: {
					actual: config.gitStrategy,
					expected: validStrategies,
					related: validStrategies,
				},
			});
		}

		// Validate reuse policy
		const validPolicies: ReusePolicy[] = ['never', 'if-available', 'always'];
		if (!config.reusePolicy) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'Workspace must have a reuse policy',
				location: { field: 'workspace.reusePolicy' },
				suggestion: `Choose one of: ${validPolicies.join(', ')}`,
				context: { related: validPolicies },
			});
		} else if (!validPolicies.includes(config.reusePolicy)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid reuse policy: ${config.reusePolicy}`,
				location: { field: 'workspace.reusePolicy' },
				suggestion: `Must be one of: ${validPolicies.join(', ')}`,
				context: {
					actual: config.reusePolicy,
					expected: validPolicies,
					related: validPolicies,
				},
			});
		}

		// Validate concurrencyKey (optional, but should be string if present)
		if (config.concurrencyKey !== undefined && typeof config.concurrencyKey !== 'string') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: 'Workspace concurrencyKey must be a string',
				location: { field: 'workspace.concurrencyKey' },
				context: {
					expected: 'string',
					actual: typeof config.concurrencyKey,
				},
			});
		}
	}

	/**
	 * Validate status transitions configuration
	 */
	private validateStatusTransitions(config: any, flowId: string): void {
		if (!config) {
			return; // Optional field, no error if missing
		}

		// Get all valid task statuses
		const validStatuses = Object.values(TaskStatus);

		// Validate onSuccess
		if (!config.onSuccess) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'statusTransitions must have onSuccess field',
				location: { field: 'statusTransitions.onSuccess' },
				suggestion: `Choose one of: ${validStatuses.join(', ')}`,
				context: { related: validStatuses },
			});
		} else if (!validStatuses.includes(config.onSuccess)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid onSuccess status: ${config.onSuccess}`,
				location: { field: 'statusTransitions.onSuccess' },
				suggestion: `Must be a valid TaskStatus: ${validStatuses.join(', ')}`,
				context: {
					actual: config.onSuccess,
					expected: validStatuses,
					related: validStatuses,
				},
			});
		}

		// Validate onFailure
		if (!config.onFailure) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'statusTransitions must have onFailure field',
				location: { field: 'statusTransitions.onFailure' },
				suggestion: `Choose one of: ${validStatuses.join(', ')}`,
				context: { related: validStatuses },
			});
		} else if (!validStatuses.includes(config.onFailure)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid onFailure status: ${config.onFailure}`,
				location: { field: 'statusTransitions.onFailure' },
				suggestion: `Must be a valid TaskStatus: ${validStatuses.join(', ')}`,
				context: {
					actual: config.onFailure,
					expected: validStatuses,
					related: validStatuses,
				},
			});
		}
	}

	/**
	 * Validate inputs
	 */
	private validateInputs(inputs: Record<string, VariableType>, flowId: string): void {
		if (!inputs) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow has no inputs defined',
				location: { field: 'inputs' },
				suggestion: 'Consider adding inputs if the flow needs parameters',
			});
			return;
		}

		const validTypes: VariableType[] = ['string', 'number', 'boolean', 'object'];

		for (const [name, type] of Object.entries(inputs)) {
			if (!validTypes.includes(type)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_VALUE,
					message: `Invalid input type for '${name}': ${type}`,
					location: { field: `inputs.${name}` },
					suggestion: `Must be one of: ${validTypes.join(', ')}`,
					context: {
						actual: type,
						expected: validTypes,
						related: validTypes,
					},
				});
			}
		}
	}

	/**
	 * Validate steps
	 * @returns Set of step IDs found in the flow
	 */
	private validateSteps(steps: FlowStep[], flowId: string): Set<string> {
		if (!steps || steps.length === 0) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.EMPTY_COLLECTION,
				message: 'Flow must have at least one step',
				location: { field: 'steps' },
				suggestion: 'Add steps to define the flow behavior',
			});
			return new Set<string>();
		}

		const stepIds = new Set<string>();

		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];

			// Validate step ID
			if (!step.id || typeof step.id !== 'string' || step.id.trim() === '') {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.MISSING_FIELD,
					message: `Step at index ${i} must have a non-empty ID`,
					location: { path: `steps[${i}].id` },
					suggestion: 'Add a unique identifier for this step',
				});
				continue; // Can't validate further without ID
			}

			// Check for duplicate IDs
			if (stepIds.has(step.id)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.DUPLICATE_ID,
					message: `Duplicate step ID: ${step.id}`,
					location: { stepId: step.id, path: `steps[${i}].id` },
					suggestion: 'Each step must have a unique ID',
					context: { related: Array.from(stepIds) },
				});
			}
			stepIds.add(step.id);

			// Validate step name
			if (!step.name || typeof step.name !== 'string') {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.MISSING_FIELD,
					message: `Step '${step.id}' should have a name`,
					location: { stepId: step.id, field: 'name' },
					suggestion: 'Add a descriptive name for this step',
				});
			}

			// Type-specific validation
			this.validateStepType(step);
		}

		return stepIds;
	}

	/**
	 * Validate step based on type
	 */
	private validateStepType(step: FlowStep): void {
		if (step.type === 'model') {
			this.validateModelStep(step);
		} else if (step.type === 'script') {
			this.validateScriptStep(step);
		} else if (step.type === 'subflow') {
			this.validateSubFlowStepSchema(step);
		} else {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid step type: ${(step as any).type}`,
				location: { stepId: (step as any).id, field: 'type' },
				suggestion: 'Type must be either "model", "script", or "subflow"',
				context: {
					actual: (step as any).type,
					expected: ['model', 'script', 'subflow'],
				},
			});
		}
	}

	/**
	 * Validate model step
	 */
	private validateModelStep(step: ModelFlowStep): void {
		// Validate prompt
		if (!step.prompt || typeof step.prompt !== 'string' || step.prompt.trim() === '') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `Model step '${step.id}' must have a non-empty prompt`,
				location: { stepId: step.id, field: 'prompt' },
				suggestion: 'Add a prompt template for the AI model',
			});
		}

		// Validate model
		const validModels: ModelType[] = ['sonnet', 'haiku', 'opus'];
		if (!step.model) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `Model step '${step.id}' must specify a model`,
				location: { stepId: step.id, field: 'model' },
				suggestion: `Choose one of: ${validModels.join(', ')}`,
				context: { related: validModels },
			});
		} else if (!validModels.includes(step.model)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid model for step '${step.id}': ${step.model}`,
				location: { stepId: step.id, field: 'model' },
				suggestion: `Must be one of: ${validModels.join(', ')}`,
				context: {
					actual: step.model,
					expected: validModels,
					related: validModels,
				},
			});
		}
	}

	/**
	 * Validate script step
	 */
	private validateScriptStep(step: ScriptFlowStep): void {
		// Validate script
		if (!step.script || typeof step.script !== 'string' || step.script.trim() === '') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `Script step '${step.id}' must have a non-empty script command`,
				location: { stepId: step.id, field: 'script' },
				suggestion: 'Add a shell command or script to execute',
			});
		}

		// Validate workingDir (optional, but should be string if present)
		if (step.workingDir !== undefined && typeof step.workingDir !== 'string') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `Script step '${step.id}' workingDir must be a string`,
				location: { stepId: step.id, field: 'workingDir' },
				context: {
					expected: 'string',
					actual: typeof step.workingDir,
				},
			});
		}

		// Validate env (optional, but should be object if present)
		if (step.env !== undefined && typeof step.env !== 'object') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `Script step '${step.id}' env must be an object`,
				location: { stepId: step.id, field: 'env' },
				context: {
					expected: 'object',
					actual: typeof step.env,
				},
			});
		}
	}

	/**
	 * Validate subflow step schema (structure only, not references)
	 */
	private validateSubFlowStepSchema(step: SubFlowStep): void {
		// Validate flowId is provided
		if (!step.flowId || typeof step.flowId !== 'string' || step.flowId.trim() === '') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `SubFlow step '${step.id}' must have a non-empty flowId`,
				location: { stepId: step.id, field: 'flowId' },
				suggestion: 'Specify the ID of the flow to execute',
			});
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
	}
}
