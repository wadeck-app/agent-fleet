/**
 * Proxy types for flow-engine
 * These are temporary types until we properly configure the imports
 */

export type ModelType = 'sonnet' | 'haiku' | 'opus'; // kept for backwards compat
export type ModelProviderName = 'claude' | 'opencode';
export type WorkspaceMode = 'isolated' | 'shared' | 'manual';
export type GitStrategy = 'main-only' | 'feature-branch' | 'any' | 'worktree';
export type ReusePolicy = 'never' | 'if-available' | 'always';

/**
 * Variable types supported in flow inputs and outputs
 */
export type VariableType =
	// Base types (legacy)
	| 'string'
	| 'number'
	| 'boolean'
	| 'object'
	// Text types
	| 'text'
	| 'url'
	| 'markdown'
	// Number types
	| 'integer'
	| 'percentage'
	| 'duration'
	// Selection types
	| 'enum'
	| 'multi-enum'
	// File types
	| 'file'
	| 'folder'
	// Date types
	| 'date'
	| 'datetime'
	// Code types
	| 'regex'
	// Structure types
	| 'array'
	| 'keyvalue'
	// Security types
	| 'password'
	// Business types
	| 'priority';

/**
 * Built-in transform functions for output parsing
 */
export type TransformFunction =
	| 'parseJSON'
	| 'parseYAML'
	| 'parseInt'
	| 'parseFloat'
	| 'parseBoolean'
	| 'trim'
	| 'toLowerCase'
	| 'toUpperCase'
	| 'split';

/**
 * Output extraction configuration for a single variable
 */
export interface OutputVariableConfig {
	/** Type of the extracted value */
	type: VariableType;

	/** Optional regex pattern for extraction from text */
	pattern?: string;

	/** Whether this field is required (checked in post-process) */
	required?: boolean;

	// violations-suppress: ts/no-union-with-string string is a named transform function reference, not a free-form string
	/** Optional transform function to apply after extraction */
	transform?: TransformFunction | string;

	/** Default value if extraction fails (only for non-required fields) */
	default?: any;
}

/**
 * Output configuration for a step
 */
export interface StepOutput {
	/** Map of variable names to extraction configs */
	[variableName: string]: OutputVariableConfig;
}

export interface WorkspaceConfig {
	mode: WorkspaceMode;
	gitStrategy: GitStrategy;
	reusePolicy: ReusePolicy;
	concurrencyKey?: string;
}

export interface BaseFlowStep {
	id: string;
	name: string;
	depends?: string[];
	when?: string;
	skipOnLoop?: boolean;
	/** Output parsing and extraction */
	output?: StepOutput;
	onFailure?: {
		goto?: string;
		maxIterations?: number;
		resetOnSuccess?: boolean;
	};
}

export interface ModelFlowStep extends BaseFlowStep {
	type: 'model';
	model?: string;
	provider?: ModelProviderName;
	prompt: string;
}

export interface ScriptFlowStep extends BaseFlowStep {
	type: 'script';
	script: string;
	workingDir?: string;
	env?: Record<string, string>;
}

export interface SubFlowStep extends BaseFlowStep {
	type: 'subflow';
	flowId: string;
	inputs: Record<string, string>;
	workspaceStrategy?: 'inherit' | 'separate';
}

export interface UserInterventionStep extends BaseFlowStep {
	type: 'user_intervention';
	interventionType: 'approval' | 'question' | 'choice';
	blocking?: boolean;
	timeout?: {
		minutes: number;
		onTimeout: 'fail' | 'continue' | 'default';
		defaultValue?: any;
	};
	approval?: {
		title: string;
		description?: string;
		allowReject?: boolean;
	};
	question?: {
		question: string;
		responseType: 'text' | 'number' | 'boolean';
	};
	choice?: {
		question: string;
		options: Array<{ id: string; label: string; description?: string }>;
		allowMultiple?: boolean;
	};
}

export type FlowStep = ModelFlowStep | ScriptFlowStep | SubFlowStep | UserInterventionStep;

export interface ExecutionConfig {
	streamJson?: boolean;
	verbose?: boolean;
	skipPermissions?: boolean;
}

export interface FlowDefinition {
	id: string;
	version: string;
	name: string;
	description: string;
	workspace: WorkspaceConfig;
	/** Input variables expected from task with their types */
	inputs: Record<string, VariableType>;
	steps: FlowStep[];
	execution?: ExecutionConfig;
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
