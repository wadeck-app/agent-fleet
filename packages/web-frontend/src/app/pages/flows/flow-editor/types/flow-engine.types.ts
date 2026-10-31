import type { FlowDefinition as SharedFlowDefinition, VariableType } from 'flow-engine/types';

/**
 * Flow-engine types for the editor: re-exported from the shared contract (packages/flow-engine/src/types.ts)
 * so the editor cannot drift from what the engine accepts. Only FlowDefinition is derived locally.
 */
export type {
	BaseFlowStep,
	ExecutionConfig,
	FlowStep,
	GitStrategy,
	ModelFlowStep,
	ModelProviderName,
	ModelType,
	OutputVariableConfig,
	ReusePolicy,
	ScriptFlowStep,
	StepOutput,
	SubFlowStep,
	TransformFunction,
	UserInterventionStep,
	VariableType,
	WorkspaceConfig,
	WorkspaceMode,
} from 'flow-engine/types';

// The editor only handles plain type names for inputs; the engine also accepts full InputDefinition objects.
export interface FlowDefinition extends Omit<SharedFlowDefinition, 'inputs'> {
	inputs: Record<string, VariableType>;
}

/**
 * Validation types (ValidationResult, ValidationIssue, ValidationSeverity)
 * are now imported from the backend flow-engine package.
 * See: packages/flow-engine/src/validation/ValidationTypes.ts
 *
 * Import them with:
 * import type { ValidationResult, ValidationIssue } from 'flow-engine/validation/ValidationTypes';
 */

/**
 * FlowValidator is now imported from the backend flow-engine package
 * See: packages/flow-engine/src/validation/FlowValidator.ts
 *
 * The real validator provides comprehensive validation including:
 * - Schema validation (structure, required fields)
 * - Graph validation (cycles, reachability, DAG)
 * - Semantic validation (references, subflows)
 * - Template validation (variable expressions)
 * - Dependency order validation (variables respect dependency graph)
 *
 * Import it in your code with:
 * import { FlowValidator } from 'flow-engine/validation/FlowValidator';
 */
