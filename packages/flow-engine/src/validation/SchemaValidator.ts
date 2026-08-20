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
import type {
	FlowDefinition,
	FlowStep,
	GitStrategy,
	InputDefinition,
	InputSpec,
	ModelFlowStep,
	NormalizedInputDefinition,
	ReusePolicy,
	ScriptFlowStep,
	SubFlowStep,
	UserInterventionStep,
	VariableType,
	WorkspaceMode,
	WorkspaceStrategy,
} from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Schema Validator
 */
export class SchemaValidator {
	/**
	 * Create a new SchemaValidator
	 * @param issueCollector - Collector for validation issues
	 * @param validTaskStatuses - Valid task status values; if empty, status values are not validated
	 */
	constructor(
		private issueCollector: IssueCollector,
		private validTaskStatuses: string[] = []
	) {}

	/**
	 * Validate flow schema
	 * @param flow - Flow definition to validate
	 * @returns Object containing step IDs and normalized inputs
	 */
	public validateSchema(flow: FlowDefinition): {
		stepIds: Set<string>;
		normalizedInputs: Record<string, NormalizedInputDefinition>;
	} {
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

		// Validate and normalize inputs
		const normalizedInputs = this.validateInputs(flow.inputs, flow.id);

		// Validate steps
		const stepIds = this.validateSteps(flow.steps, flow.id);

		return { stepIds, normalizedInputs };
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
		const validStrategies: GitStrategy[] = ['main-only', 'feature-branch', 'any', 'worktree', 'none'];
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

		const validStatuses = this.validTaskStatuses;

		// Validate onSuccess
		if (!config.onSuccess) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: 'statusTransitions must have onSuccess field',
				location: { field: 'statusTransitions.onSuccess' },
				suggestion:
					validStatuses.length > 0
						? `Choose one of: ${validStatuses.join(', ')}`
						: 'Provide a valid status string',
				context: { related: validStatuses },
			});
		} else if (validStatuses.length > 0 && !validStatuses.includes(config.onSuccess)) {
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
				suggestion:
					validStatuses.length > 0
						? `Choose one of: ${validStatuses.join(', ')}`
						: 'Provide a valid status string',
				context: { related: validStatuses },
			});
		} else if (validStatuses.length > 0 && !validStatuses.includes(config.onFailure)) {
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
	 * Validate and normalize inputs
	 * Validates input format and returns normalized definitions
	 * @returns Record of normalized input definitions
	 */
	private validateInputs(
		inputs: Record<string, InputSpec>,
		flowId: string
	): Record<string, NormalizedInputDefinition> {
		const normalized: Record<string, NormalizedInputDefinition> = {};

		if (!inputs) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.MISSING_FIELD,
				message: 'Flow has no inputs defined',
				location: { field: 'inputs' },
				suggestion: 'Consider adding inputs if the flow needs parameters',
			});
			return normalized;
		}

		const validTypes: VariableType[] = [
			// Base types
			'string',
			'number',
			'boolean',
			'object',
			// Text types
			'text',
			'url',
			'markdown',
			// Number types
			'integer',
			'percentage',
			'duration',
			// Selection types
			'enum',
			'multi-enum',
			// File types
			'file',
			'folder',
			// Date types
			'date',
			'datetime',
			// Code types
			'regex',
			// Structure types
			'array',
			'keyvalue',
			// Security types
			'password',
			// Business types
			'priority',
		];

		for (const [name, inputSpec] of Object.entries(inputs)) {
			// Handle shorthand format (string)
			if (typeof inputSpec === 'string') {
				if (!validTypes.includes(inputSpec as VariableType)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_VALUE,
						message: `Invalid input type for '${name}': ${inputSpec}`,
						location: { field: `inputs.${name}` },
						suggestion: `Must be one of: ${validTypes.join(', ')}`,
						context: {
							actual: inputSpec,
							expected: validTypes,
							related: validTypes,
						},
					});
				} else {
					// Normalize shorthand to full definition
					normalized[name] = {
						type: inputSpec as VariableType,
						required: false,
						source: 'explicit',
					};
				}
			}
			// Handle extended format (object)
			else if (typeof inputSpec === 'object' && inputSpec !== null) {
				const def = inputSpec as InputDefinition;

				if (!def.type) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.MISSING_FIELD,
						message: `Input '${name}' is missing required 'type' field`,
						location: { field: `inputs.${name}` },
						suggestion: 'Add a type field: string, number, boolean, or object',
					});
				} else if (!validTypes.includes(def.type)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_VALUE,
						message: `Invalid input type for '${name}': ${def.type}`,
						location: { field: `inputs.${name}.type` },
						suggestion: `Must be one of: ${validTypes.join(', ')}`,
						context: {
							actual: def.type,
							expected: validTypes,
							related: validTypes,
						},
					});
				} else {
					// Normalize extended format
					normalized[name] = {
						type: def.type,
						required: def.required ?? false,
						default: def.default,
						description: def.description,
						options: def.options,
						source: 'explicit',
					};

					// Warn if default value type doesn't match declared type
					if (def.default !== undefined) {
						const defaultType = typeof def.default;
						const expectedType = def.type === 'object' ? 'object' : def.type;

						if (defaultType !== expectedType) {
							this.issueCollector.addIssue({
								severity: 'warning',
								code: ValidationCode.TYPE_MISMATCH,
								message: `Default value type '${defaultType}' for input '${name}' does not match declared type '${def.type}'`,
								location: { field: `inputs.${name}.default` },
								suggestion: `Ensure default value matches the declared type`,
								context: {
									actual: defaultType,
									expected: expectedType,
								},
							});
						}
					}
				}
			} else {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_VALUE,
					message: `Invalid input specification for '${name}': expected string or object`,
					location: { field: `inputs.${name}` },
					suggestion:
						'Use either shorthand (e.g., "string") or extended format (e.g., { type: "string", required: true })',
				});
			}
		}

		return normalized;
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

			// Validate writeOutput paths (must be relative, no path traversal)
			if (step.output) {
				for (const [outputName, outputConfig] of Object.entries(step.output)) {
					if (typeof outputConfig === 'string' || !outputConfig.writeOutput) continue;
					{
						const normalized = outputConfig.writeOutput.replace(/\\/g, '/');
						if (normalized.includes('..') || normalized.startsWith('/')) {
							this.issueCollector.addIssue({
								severity: 'error',
								code: ValidationCode.INVALID_VALUE,
								message: `Step '${step.id}' output '${outputName}' writeOutput path '${outputConfig.writeOutput}' is invalid: must be a relative path within the workspace`,
								location: { stepId: step.id, field: `output.${outputName}.writeOutput` },
								suggestion: `Use a simple relative path like 'response.txt' or 'subdir/response.txt'`,
							});
						}
					}
				}
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
			this.validateModelStep(step as ModelFlowStep);
		} else if (step.type === 'script') {
			this.validateScriptStep(step as ScriptFlowStep);
		} else if (step.type === 'subflow') {
			this.validateSubFlowStepSchema(step as SubFlowStep);
		} else if (step.type === 'user_intervention') {
			this.validateUserInterventionStep(step as UserInterventionStep);
		} else {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid step type: ${(step as any).type}`,
				location: { stepId: (step as any).id, field: 'type' },
				suggestion: 'Type must be either "model", "script", "subflow", or "user_intervention"',
				context: {
					actual: (step as any).type,
					expected: ['model', 'script', 'subflow', 'user_intervention'],
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

		// Validate model — now a free-form string (provider-specific model identifier)
		// @formatter:off
		const modelRegex = /^[a-zA-Z0-9_./:@-]{1,256}$/;
		// @formatter:on
		if (step.model !== undefined && !modelRegex.test(step.model)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Invalid model for step '${step.id}': '${step.model}'`,
				location: { stepId: step.id, field: 'model' },
				suggestion: `Model must match ^[a-zA-Z0-9_./:@-]{1,256}$ (e.g. "claude-3-5-haiku", "anthropic/claude-3-5-sonnet")`,
				context: {
					actual: step.model,
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

	/**
	 * Validate user intervention step schema (structure only)
	 */
	private validateUserInterventionStep(step: UserInterventionStep): void {
		// Validate interventionType is provided
		const validTypes = ['approval', 'question', 'choice'];
		if (!step.interventionType || !validTypes.includes(step.interventionType)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.MISSING_FIELD,
				message: `UserIntervention step '${step.id}' must have a valid interventionType`,
				location: { stepId: step.id, field: 'interventionType' },
				suggestion: `Must be one of: ${validTypes.join(', ')}`,
				context: {
					actual: step.interventionType,
					expected: validTypes,
				},
			});
		}

		// Validate type-specific configuration
		if (step.interventionType === 'approval') {
			if (!step.approval) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.MISSING_FIELD,
					message: `UserIntervention step '${step.id}' of type 'approval' must have an 'approval' config`,
					location: { stepId: step.id, field: 'approval' },
					suggestion: 'Add an approval configuration with title and optional description',
				});
			} else {
				// Validate approval.title
				if (!step.approval.title || typeof step.approval.title !== 'string') {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.MISSING_FIELD,
						message: `Approval step '${step.id}' must have a non-empty title`,
						location: { stepId: step.id, field: 'approval.title' },
						suggestion: 'Add a title describing what needs approval',
					});
				}
			}
		} else if (step.interventionType === 'question') {
			if (!step.question) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.MISSING_FIELD,
					message: `UserIntervention step '${step.id}' of type 'question' must have a 'question' config`,
					location: { stepId: step.id, field: 'question' },
					suggestion: 'Add a question configuration with question text and responseType',
				});
			} else {
				// Validate question.question
				if (!step.question.question || typeof step.question.question !== 'string') {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.MISSING_FIELD,
						message: `Question step '${step.id}' must have a non-empty question`,
						location: { stepId: step.id, field: 'question.question' },
						suggestion: 'Add a question text',
					});
				}
				// Validate question.responseType
				const validResponseTypes = ['text', 'number', 'boolean'];
				if (!step.question.responseType || !validResponseTypes.includes(step.question.responseType)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_VALUE,
						message: `Question step '${step.id}' must have a valid responseType`,
						location: { stepId: step.id, field: 'question.responseType' },
						suggestion: `Must be one of: ${validResponseTypes.join(', ')}`,
						context: {
							actual: step.question.responseType,
							expected: validResponseTypes,
						},
					});
				}
			}
		} else if (step.interventionType === 'choice') {
			if (!step.choice) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.MISSING_FIELD,
					message: `UserIntervention step '${step.id}' of type 'choice' must have a 'choice' config`,
					location: { stepId: step.id, field: 'choice' },
					suggestion: 'Add a choice configuration with question and options',
				});
			} else {
				// Validate choice.question
				if (!step.choice.question || typeof step.choice.question !== 'string') {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.MISSING_FIELD,
						message: `Choice step '${step.id}' must have a non-empty question`,
						location: { stepId: step.id, field: 'choice.question' },
						suggestion: 'Add a question text',
					});
				}
				// Validate choice.options
				if (!Array.isArray(step.choice.options) || step.choice.options.length === 0) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.EMPTY_COLLECTION,
						message: `Choice step '${step.id}' must have at least one option`,
						location: { stepId: step.id, field: 'choice.options' },
						suggestion: 'Add at least one choice option with id and label',
					});
				}
			}
		}

		// Validate blocking (optional, should be boolean if present)
		if (step.blocking !== undefined && typeof step.blocking !== 'boolean') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `UserIntervention step '${step.id}' blocking must be a boolean`,
				location: { stepId: step.id, field: 'blocking' },
				context: {
					expected: 'boolean',
					actual: typeof step.blocking,
				},
			});
		}

		// Validate timeout structure (optional)
		if (step.timeout) {
			if (typeof step.timeout.minutes !== 'number' || step.timeout.minutes <= 0) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_VALUE,
					message: `UserIntervention step '${step.id}' timeout minutes must be a positive number`,
					location: { stepId: step.id, field: 'timeout.minutes' },
					suggestion: 'Set a positive number of minutes for timeout',
				});
			}
			const validTimeoutActions = ['fail', 'continue', 'default'];
			if (!step.timeout.onTimeout || !validTimeoutActions.includes(step.timeout.onTimeout)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.INVALID_VALUE,
					message: `UserIntervention step '${step.id}' timeout.onTimeout must be valid`,
					location: { stepId: step.id, field: 'timeout.onTimeout' },
					suggestion: `Must be one of: ${validTimeoutActions.join(', ')}`,
					context: {
						actual: step.timeout.onTimeout,
						expected: validTimeoutActions,
					},
				});
			}
		}

		// Validate outputs for user_intervention steps
		if (step.output) {
			// Available sources from InterventionResponse (see StepRunner.ts line 562-577)
			const availableSources = new Set([
				'intervention.value',
				'intervention.comment',
				'intervention.answeredBy',
				'intervention.answeredAt',
				'intervention.userResponse',
				'intervention.approved',
				'intervention.rejected',
				'intervention.answer',
				'intervention.choice',
			]);

			for (const [outputName, outputConfig] of Object.entries(step.output)) {
				// UserIntervention steps should NOT have patterns or jsonpath
				if (outputConfig.pattern) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_VALUE,
						message: `UserIntervention step '${step.id}' output '${outputName}' must not have a pattern`,
						location: { stepId: step.id, field: `output.${outputName}.pattern` },
						suggestion: `Remove 'pattern' and use 'from' instead to specify the source explicitly.`,
					});
				}
				if (outputConfig.jsonpath) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_VALUE,
						message: `UserIntervention step '${step.id}' output '${outputName}' must not have a jsonpath`,
						location: { stepId: step.id, field: `output.${outputName}.jsonpath` },
						suggestion: `Remove 'jsonpath' and use 'from' instead to specify the source explicitly.`,
					});
				}

				// UserIntervention steps MUST have 'from' field
				if (!outputConfig.from) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.MISSING_FIELD,
						message: `UserIntervention step '${step.id}' output '${outputName}' must have a 'from' field`,
						location: { stepId: step.id, field: `output.${outputName}.from` },
						suggestion: `Add 'from' field. Examples: 'intervention.approved', 'intervention.comment', 'intervention.answeredBy'. Available sources: ${Array.from(availableSources).join(', ')}`,
					});
				} else {
					// Validate that 'from' points to an available source
					if (!availableSources.has(outputConfig.from)) {
						this.issueCollector.addIssue({
							severity: 'error',
							code: ValidationCode.INVALID_VALUE,
							message: `UserIntervention step '${step.id}' output '${outputName}' has invalid 'from' value: '${outputConfig.from}'`,
							location: { stepId: step.id, field: `output.${outputName}.from` },
							suggestion: `Must be one of: ${Array.from(availableSources).join(', ')}`,
							context: {
								actual: outputConfig.from,
								expected: Array.from(availableSources),
							},
						});
					}
				}
			}
		}
	}
}
