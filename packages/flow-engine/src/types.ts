/**
 * Core type definitions for the Flow System
 *
 * This module defines all the core interfaces and types for the workflow engine,
 * including flow definitions, steps, workspaces, and execution traces.
 */
import { TaskStatus } from 'shared-orch-worker/domain-types';

/**
 * Supported model types for step execution
 */
export type ModelType = 'sonnet' | 'haiku' | 'opus';

/**
 * Workspace modes determine isolation and concurrency behavior
 */
export type WorkspaceMode = 'isolated' | 'shared' | 'manual';

/**
 * Git strategy defines which branches can be used
 */
export type GitStrategy = 'main-only' | 'feature-branch' | 'any' | 'worktree';

/**
 * Reuse policy determines when workspaces can be reused
 */
export type ReusePolicy = 'never' | 'if-available' | 'always';

/**
 * Variable types supported in flow inputs and outputs
 */
export type VariableType = 'string' | 'number' | 'boolean' | 'object';

/**
 * Workspace strategy for SubFlowStep execution
 */
export type WorkspaceStrategy = 'inherit' | 'separate';

/**
 * Retry backoff strategies
 */
export type BackoffStrategy = 'linear' | 'exponential';

/**
 * Flow execution status
 */
export type FlowStatus = 'running' | 'completed' | 'failed';

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
 * Validation rule types
 */
export type ValidationRuleType = 'required' | 'pattern' | 'min' | 'max' | 'minLength' | 'maxLength' | 'enum' | 'custom';

/**
 * Validation rule configuration
 */
export interface ValidationRule {
	type: ValidationRuleType;
	value?: any;
	message?: string;
}

/**
 * Workspace configuration for a flow
 */
export interface WorkspaceConfig {
	/** Workspace isolation mode */
	mode: WorkspaceMode;

	/** Git branching strategy */
	gitStrategy: GitStrategy;

	/** Workspace reuse policy */
	reusePolicy: ReusePolicy;

	/** Optional concurrency key for grouping compatible workspaces */
	concurrencyKey?: string;
}

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

/**
 * Conditional transition configuration
 */
export interface ConditionalTransition {
	/** JavaScript expression to evaluate (e.g., "output.approved === true") */
	when: string;

	/** Target step ID to transition to if condition is true */
	goto: string;
}

/**
 * Next step configuration with conditions
 */
export interface NextStepConfig {
	/** Default next step ID if no conditions match */
	default?: string;

	/** Conditional transitions */
	conditions?: ConditionalTransition[];
}

/**
 * Retry configuration for a step
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxAttempts: number;

	/** Backoff strategy between retries */
	backoff: BackoffStrategy;
}

/**
 * Failure handling configuration with goto loop support
 */
export interface FailureConfig {
	/** Step ID to jump back to on failure (creates a feedback loop) */
	goto?: string;

	/** Maximum iterations for this step (default: 3) */
	maxIterations?: number;

	/** Reset iteration counter when target step succeeds (default: false) */
	resetOnSuccess?: boolean;

	/** Auto-comment to add when loop is triggered (Phase 4 feature) */
	addComment?: string;
}

/**
 * Context gathering configuration for a step
 */
export interface StepContext {
	/** Glob patterns for files to include */
	files?: string[];

	/** Step IDs whose outputs should be included */
	previousOutputs?: string[];

	/** Keys from task metadata to include */
	taskMetadata?: string[];
}

/**
 * Pre-process validation (input contract)
 */
export interface PreProcess {
	/** Validation rules for input variables */
	validateInputs?: Record<string, ValidationRule[]>;

	/** List of required input variable names */
	required?: string[];
}

/**
 * Post-process validation (output contract)
 */
export interface PostProcess {
	/** Validation rules for output variables */
	validateOutputs?: Record<string, ValidationRule[]>;

	/** List of required output variable names */
	required?: string[];
}

/**
 * Step contract for input/output validation
 */
export interface StepContract {
	/** Pre-execution validation */
	preProcess?: PreProcess;

	/** Post-execution validation */
	postProcess?: PostProcess;
}

/**
 * Base step interface with common properties
 */
export interface BaseFlowStep {
	/** Unique step identifier within the flow */
	id: string;

	/** Human-readable step name */
	name: string;

	/** Context to provide to the step */
	context?: StepContext;

	/** Output parsing and extraction */
	output?: StepOutput;

	/** Step IDs this step depends on (must complete before this step runs) */
	depends?: string[];

	/** Conditional execution expression (evaluated to boolean) */
	when?: string;

	/** Skip this step when a loop is triggered (useful for one-time setup steps) */
	skipOnLoop?: boolean;

	/** Retry configuration */
	retry?: RetryConfig;

	/** Failure handling configuration (feedback loops with goto) */
	onFailure?: FailureConfig;

	/** Input/output validation contract */
	contract?: StepContract;
}

/**
 * Step that executes using an AI model
 */
export interface ModelFlowStep extends BaseFlowStep {
	/** Step type discriminator */
	type: 'model';

	/** Model to use for this step */
	model: ModelType;

	/** Prompt template with variable interpolation support */
	prompt: string;
}

/**
 * Step that executes a shell script/command
 */
export interface ScriptFlowStep extends BaseFlowStep {
	/** Step type discriminator */
	type: 'script';

	/** Script or command to execute */
	script: string;

	/** Optional working directory for script execution */
	workingDir?: string;

	/** Optional environment variables */
	env?: Record<string, string>;

	/** Whether to capture stdout/stderr */
	captureOutput?: boolean;
}

/**
 * Output configuration for a SubFlowStep (uses templates)
 */
export interface SubFlowStepOutput {
	/** Map of variable names to template strings for extracting from subflow outputs */
	[variableName: string]: string | OutputVariableConfig;
}

/**
 * Step that executes another flow (composition)
 */
export interface SubFlowStep extends Omit<BaseFlowStep, 'output'> {
	/** Step type discriminator */
	type: 'subflow';

	/** ID of the flow to execute */
	flowId: string;

	/** Template inputs to pass to the subflow */
	inputs: Record<string, string>;

	/** Workspace strategy (default: 'inherit') */
	workspaceStrategy?: WorkspaceStrategy;

	/** Output mapping using templates (e.g., { result: '${{ steps.echo.outputs.value }}' }) */
	output?: SubFlowStepOutput;

	/**
	 * Allow recursive calls (flow calling itself)
	 * Must be explicitly set to true to enable recursion.
	 * Use with caution and ensure proper exit conditions via 'when' clause.
	 */
	allowRecursion?: boolean;
}

/**
 * Union type for all step types (discriminated by 'type' field)
 */
export type FlowStep = ModelFlowStep | ScriptFlowStep | SubFlowStep;

/**
 * Flow lifecycle hooks
 */
export interface FlowHooks {
	/** Command to execute when flow starts */
	onStart?: string;

	/** Command to execute when flow completes successfully */
	onComplete?: string;

	/** Command to execute when flow encounters an error */
	onError?: string;
}

/**
 * Status transitions configuration for flow completion
 */
export interface StatusTransitions {
	/** Task status to set when flow completes successfully */
	onSuccess: TaskStatus;

	/** Task status to set when flow fails */
	onFailure: TaskStatus;
}

/**
 * Complete flow definition
 */
export interface FlowDefinition {
	/** Unique flow identifier */
	id: string;

	/** Semantic version (e.g., "1.0.0") */
	version: string;

	/** Human-readable flow name */
	name: string;

	/** Flow description */
	description: string;

	/** Workspace requirements */
	workspace: WorkspaceConfig;

	/** Input variables expected from task */
	inputs: Record<string, VariableType>;

	/** Flow steps to execute */
	steps: FlowStep[];

	/** Optional lifecycle hooks */
	hooks?: FlowHooks;

	/** Optional status transitions configuration (defaults: onSuccess=review, onFailure=changes_requested) */
	statusTransitions?: StatusTransitions;
}

/**
 * Flow metadata for discovery and synchronization
 * Contains essential flow information without step details
 */
export interface FlowMetadata {
	/** Unique flow identifier */
	id: string;

	/** Semantic version */
	version: string;

	/** 8-character SHA256 hash of flow content (steps, workspace, inputs) */
	hash: string;

	/** Human-readable flow name */
	name: string;

	/** Flow description */
	description: string;

	/** Input variables expected from task */
	inputs: Record<string, VariableType>;

	/** Workspace requirements */
	workspace: WorkspaceConfig;

	/** Optional status transitions configuration */
	statusTransitions?: StatusTransitions;
}

/**
 * Git state information for a workspace
 */
export interface WorkspaceGitState {
	/** Current branch name */
	branch: string;

	/** Whether the working directory is clean */
	isClean: boolean;

	/** Latest commit hash */
	lastCommit: string;
}

/**
 * Concurrency control for a workspace
 */
export interface WorkspaceConcurrency {
	/** Group identifier for compatible workspaces */
	key: string;

	/** Set of task IDs currently using this workspace */
	activeTasks: Set<string>;

	/** Whether workspace is exclusively locked for modifications */
	locked: boolean;
}

/**
 * Workspace instance
 */
export interface Workspace {
	/** Unique workspace identifier */
	id: string;

	/** Absolute path to workspace directory */
	path: string;

	/** Workspace mode (isolated or shared) */
	mode: WorkspaceMode;

	/** Git state (if applicable) */
	git?: WorkspaceGitState;

	/** Concurrency control */
	concurrency: WorkspaceConcurrency;

	/** Creation timestamp (ISO 8601) */
	createdAt: string;

	/** Last usage timestamp (ISO 8601) */
	lastUsedAt: string;

	/** Number of times this workspace has been used */
	usageCount: number;
}

/**
 * Trace of a single step execution
 */
export interface StepTrace {
	/** Step identifier */
	stepId: string;

	/** Step name */
	stepName: string;

	/** Step type */
	stepType: 'model' | 'script' | 'subflow';

	/** Start time (Unix timestamp in ms) */
	startTime: number;

	/** End time (Unix timestamp in ms) */
	endTime?: number;

	/** Duration in milliseconds */
	durationMs?: number;

	// Model step fields
	/** Model used (for type='model') */
	model?: string;

	/** Rendered prompt sent to model (for type='model') */
	prompt?: string;

	/** Model response (for type='model') */
	response?: string;

	// Script step fields
	/** Script executed (for type='script') */
	script?: string;

	/** Exit code (for type='script') */
	exitCode?: number;

	/** Standard output (for type='script') */
	stdout?: string;

	/** Standard error (for type='script') */
	stderr?: string;

	// SubFlow step fields
	/** Flow ID executed (for type='subflow') */
	subFlowId?: string;

	/** Workspace strategy used (for type='subflow') */
	workspaceStrategy?: WorkspaceStrategy;

	/** Nesting depth (for type='subflow') */
	nestingDepth?: number;

	// Common fields
	/** Extracted output variables */
	outputs?: Record<string, any>;

	/** Error message if step failed */
	error?: string;

	/** Number of retry attempts */
	retries?: number;
}

/**
 * Complete flow execution trace
 */
export interface FlowTrace {
	/** Unique trace identifier */
	id: string;

	/** Associated task ID */
	taskId: string;

	/** Flow ID that was executed */
	flowId: string;

	/** Workspace ID used for execution */
	workspaceId: string;

	/** Start time (Unix timestamp in ms) */
	startTime: number;

	/** End time (Unix timestamp in ms) */
	endTime?: number;

	/** Current execution status */
	status: FlowStatus;

	/** Traces for each executed step */
	steps: StepTrace[];
}

/**
 * Context available during flow execution
 */
export interface FlowExecutionContext {
	/** Current task ID */
	taskId: string;

	/** Flow being executed */
	flow: FlowDefinition;

	/** Workspace being used */
	workspace: Workspace;

	/** Input variables from task */
	inputs: Record<string, any>;

	/** Task metadata */
	taskMetadata: Record<string, any>;

	/** Outputs from completed steps (keyed by step ID) */
	stepOutputs: Map<string, Record<string, any>>;

	/** Current execution trace */
	trace: FlowTrace;

	/** Loop metadata for tracking iterations and preventing infinite loops */
	meta: {
		/** Per-step iteration count (how many times each step has been executed) */
		iterations: Map<string, number>;

		/** Total number of loops triggered in this flow execution */
		totalLoops: number;

		/** Whether currently in a loop (true after goto triggered, false on fresh execution) */
		inLoop: boolean;
	};
}

/**
 * Result of a step execution
 */
export interface StepExecutionResult {
	/** Whether the step succeeded */
	success: boolean;

	/** Extracted output variables */
	outputs?: Record<string, any>;

	/** Model response */
	response?: string;

	/** Error message if failed */
	error?: string;

	/** Next step ID to execute (null means end flow) */
	nextStepId?: string | null;
}

/**
 * Result of a complete flow execution
 */
export interface FlowExecutionResult {
	/** Whether the flow completed successfully */
	success: boolean;

	/** Complete execution trace */
	trace: FlowTrace;

	/** Error message if flow failed */
	error?: string;

	/** Final outputs from all steps */
	outputs: Record<string, Record<string, any>>;
}

/**
 * DAG (Directed Acyclic Graph) representation of flow steps
 */
export interface DAG {
	/** All nodes in the graph, keyed by step ID */
	nodes: Map<string, DAGNode>;

	/** Root nodes (steps with no dependencies) */
	roots: string[];

	/** Leaf nodes (steps with no dependents) */
	leaves: string[];
}

/**
 * A node in the DAG representing a single step
 */
export interface DAGNode {
	/** The step this node represents */
	step: FlowStep;

	/** Step IDs this step depends on (incoming edges) */
	dependencies: string[];

	/** Step IDs that depend on this step (outgoing edges) */
	dependents: string[];
}
