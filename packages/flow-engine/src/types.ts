import type { ValidationIssue } from './validation/ValidationTypes';

/**
 * Core type definitions for the Flow System
 *
 * This module defines all the core interfaces and types for the workflow engine,
 * including flow definitions, steps, workspaces, and execution traces.
 */
export type TaskStatus = string;
export type TicketStatus = string;

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
export type GitStrategy = 'main-only' | 'feature-branch' | 'any' | 'worktree' | 'none';

/**
 * Reuse policy determines when workspaces can be reused
 */
export type ReusePolicy = 'never' | 'if-available' | 'always';

/**
 * Variable types supported in flow inputs and outputs
 *
 * Base types:
 * - string, number, boolean, object (legacy, always supported)
 *
 * Text types:
 * - text (multiligne), url, markdown
 *
 * Number types:
 * - integer, percentage, duration
 *
 * Selection types:
 * - enum, multi-enum
 *
 * File types:
 * - file, folder
 *
 * Date types:
 * - date, datetime
 *
 * Code types:
 * - regex
 *
 * Structure types:
 * - array, keyvalue
 *
 * Security types:
 * - password
 *
 * Business types:
 * - priority
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
 * Options for string/text type inputs
 */
export interface StringOptions {
	/** Minimum length */
	minLength?: number;
	/** Maximum length */
	maxLength?: number;
	/** Regex pattern for validation */
	pattern?: string;
	/** Placeholder text */
	placeholder?: string;
}

/**
 * Options for URL type inputs
 */
export interface UrlOptions {
	/** Allowed protocols (default: ['http', 'https']) */
	protocols?: string[];
	/** Validate URL accessibility */
	validate?: boolean;
	/** Require TLS/HTTPS only */
	requireTLS?: boolean;
}

/**
 * Options for number/integer type inputs
 */
export interface NumberOptions {
	/** Minimum value */
	min?: number;
	/** Maximum value */
	max?: number;
	/** Step/increment value */
	step?: number;
	/** Force integer values only (for 'number' type) */
	integer?: boolean;
}

/**
 * Options for duration type inputs
 */
export interface DurationOptions {
	/** Unit (default: 'seconds') */
	unit?: 'seconds' | 'minutes' | 'hours' | 'days';
	/** Allowed units for selection */
	allowedUnits?: Array<'seconds' | 'minutes' | 'hours' | 'days'>;
	/** Minimum value */
	min?: number;
	/** Maximum value */
	max?: number;
}

/**
 * Enum option definition
 */
export interface EnumOption {
	/** Value to be stored */
	value: string | number;
	/** Label to display */
	label: string;
	/** Optional description */
	description?: string;
}

/**
 * Options for enum/multi-enum type inputs
 */
export interface EnumOptions {
	/** List of available options */
	options: EnumOption[];
	/** Enable search/filter in dropdown */
	searchable?: boolean;
}

/**
 * Options for file type inputs
 */
export interface FileOptions {
	/** Allowed file extensions (e.g., ['.js', '.ts']) */
	extensions?: string[];
	/** File must exist */
	mustExist?: boolean;
	/** Base path (default: workspace root) */
	basePath?: string;
	/** Show file content preview */
	preview?: boolean;
}

/**
 * Options for folder type inputs
 */
export interface FolderOptions {
	/** Folder must exist */
	mustExist?: boolean;
	/** Create folder if missing */
	createIfMissing?: boolean;
	/** Base path (default: workspace root) */
	basePath?: string;
}

/**
 * Options for date/datetime type inputs
 */
export interface DateOptions {
	/** Minimum date (ISO string or relative like 'today', '+7d') */
	min?: string;
	/** Maximum date (ISO string or relative like 'today', '+30d') */
	max?: string;
	/** Date format for display (default: 'YYYY-MM-DD') */
	format?: string;
}

/**
 * Options for regex type inputs
 */
export interface RegexOptions {
	/** Validate regex syntax */
	validate?: boolean;
	/** Test string to validate regex against */
	testString?: string;
}

/**
 * Options for array type inputs
 */
export interface ArrayOptions {
	/** Type of array items */
	itemType?: VariableType;
	/** Minimum number of items */
	minItems?: number;
	/** Maximum number of items */
	maxItems?: number;
	/** Items must be unique */
	unique?: boolean;
}

/**
 * Options for keyvalue type inputs
 */
export interface KeyValueOptions {
	/** Type of keys (default: 'string') */
	keyType?: 'string';
	/** Type of values (default: 'string') */
	valueType?: VariableType;
	/** Minimum number of pairs */
	minPairs?: number;
	/** Maximum number of pairs */
	maxPairs?: number;
}

/**
 * Priority levels for priority type
 */
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Union type of all possible options
 */
export type InputOptions =
	| StringOptions
	| UrlOptions
	| NumberOptions
	| DurationOptions
	| EnumOptions
	| FileOptions
	| FolderOptions
	| DateOptions
	| RegexOptions
	| ArrayOptions
	| KeyValueOptions;

/**
 * Extended input definition with metadata
 * Used for declaring inputs with additional constraints and documentation
 */
export interface InputDefinition {
	/** Type of the input variable */
	type: VariableType;

	/** Whether this input is required (default: false) */
	required?: boolean;

	/** Default value if input is not provided */
	default?: any;

	/** Description for UI tooltips and documentation */
	description?: string;

	/** Type-specific options and constraints */
	options?: InputOptions;
}

/**
 * Input specification - either shorthand (type only) or extended (with metadata)
 * Examples:
 * - Shorthand: "string"
 * - Extended: { type: "string", required: true, description: "..." }
 */
export type InputSpec = VariableType | InputDefinition;

/**
 * Normalized input definition (internal representation)
 * All inputs are normalized to this format during flow parsing
 */
export interface NormalizedInputDefinition {
	/** Type of the input variable */
	type: VariableType;

	/** Whether this input is required */
	required: boolean;

	/** Default value if input is not provided */
	default?: any;

	/** Description for UI tooltips and documentation */
	description?: string;

	/** Type-specific options and constraints */
	options?: InputOptions;

	/** Source of this input definition */
	source: 'explicit' | 'auto-discovered';
}

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

	/** Optional regex pattern for extraction from text (for script/model steps) */
	pattern?: string;

	/** JSONPath expression for extracting a value from JSON output (e.g. '$.status'). Mutually exclusive with pattern. */
	jsonpath?: string;

	/**
	 * Source path for extraction (for user_intervention steps)
	 * Examples: 'intervention.approved', 'intervention.comment', 'intervention.answeredBy'
	 * This makes it explicit where the value comes from - no magic!
	 */
	from?: string;

	/** Whether this field is required (checked in post-process) */
	required?: boolean;

	/** Optional transform function to apply after extraction */
	transform?: TransformFunction | string;

	/** Default value if extraction fails (only for non-required fields) */
	default?: any;

	/**
	 * Write the extracted value to a file in the workspace directory.
	 * Path is relative to workspaceDir (e.g. 'response.txt').
	 * Prevents shell injection when consuming multi-line model outputs in script steps.
	 * Use `${{ context.workspaceDir }}/response.txt` to reference the file in subsequent steps.
	 */
	writeOutput?: string;
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

	/**
	 * Controls when Claude output is sent as log entries.
	 * - streaming: each assistant text chunk → log entry in real-time
	 * - end: all entries sent after model completes (default)
	 * - none: output suppressed from logs
	 * - polling: entries flushed every 500ms
	 */
	log?: 'streaming' | 'end' | 'none' | 'polling';

	/**
	 * Controls whether tool calls are shown in logs.
	 * Only applies when log is 'streaming' or 'polling'.
	 * - none: no tool call events (default)
	 * - name: show tool name only (→ Bash)
	 * - full: show tool name + input + result (→ Bash: sleep 5 / ← Bash: ...)
	 */
	toolLog?: 'none' | 'name' | 'full';

	/**
	 * Session continuation: resume a previous model step's Claude session.
	 * The new prompt is injected as a user message into the existing conversation.
	 */
	session?: {
		/** Step ID whose Claude session to continue (must be a model step in depends chain) */
		continue: string;
		/**
		 * How to continue:
		 * - 'append': adds a new user message to the existing session (shared history)
		 * - 'fork': copies the session .jsonl to a new UUID — each fork is independent
		 */
		mode: 'append' | 'fork';
	};
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
 * Step that requires user intervention/approval
 * Pauses flow execution until user responds
 */
export interface UserInterventionStep extends BaseFlowStep {
	/** Step type discriminator */
	type: 'user_intervention';

	/** Type of intervention requested */
	interventionType: 'approval' | 'question' | 'choice';

	/** Block flow execution until answered (default: true) */
	blocking?: boolean;

	/** Timeout configuration */
	timeout?: {
		minutes: number;
		onTimeout: 'fail' | 'continue' | 'default';
		defaultValue?: unknown;
	};

	/** Configuration for approval type */
	approval?: {
		title: string;
		description?: string;
		allowReject?: boolean;
	};

	/** Configuration for question type */
	question?: {
		question: string;
		responseType: 'text' | 'number' | 'boolean';
		validation?: ValidationRule[];
	};

	/** Configuration for choice type */
	choice?: {
		question: string;
		options: Array<{
			id: string;
			label: string;
			description?: string;
		}>;
		allowMultiple?: boolean;
	};
}

/**
 * Union type for all step types (discriminated by 'type' field)
 */
export type FlowStep = ModelFlowStep | ScriptFlowStep | SubFlowStep | UserInterventionStep;

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
/**
 * Extended status transition config that can update both a Task and its linked Ticket
 */
export interface StatusTransitionConfig {
	/** Task status to set */
	task?: TaskStatus;
	/** Ticket status to set on the linked ticket (identified by Task.ticketId) */
	ticket?: TicketStatus;
}

export interface StatusTransitions {
	/** Task status or extended config to apply on flow success */
	onSuccess: TaskStatus | StatusTransitionConfig;

	/** Task status or extended config to apply on flow failure */
	onFailure: TaskStatus | StatusTransitionConfig;
}

/**
 * Event-based flow trigger - fires when a matching event is emitted
 */
export interface EventFlowTrigger {
	/** Trigger type discriminator */
	type: 'event';
	/** Event name to listen for (e.g., 'ticket.status.changed') */
	event: string;
	/** Optional filter criteria - all specified fields must match */
	filter?: Record<string, string | undefined>;
}

/**
 * Union of all supported flow trigger types (extensible)
 */
export type FlowTrigger = EventFlowTrigger;

/**
 * Execution configuration for Claude CLI invocations
 */
export interface ExecutionConfig {
	/** Enable --output-format=stream-json (default: true) */
	streamJson?: boolean;
	/** Enable --verbose flag (default: true) */
	verbose?: boolean;
	/** Enable --dangerously-skip-permissions (default: true) */
	skipPermissions?: boolean;
}

/**
 * Live log entry streamed during model step execution
 */
export interface LiveLogEntry {
	/** Unique entry identifier */
	id: string;
	/** Unix timestamp in ms */
	timestamp: number;
	/** Log level for display */
	level: 'debug' | 'info' | 'warning' | 'error';
	/** Human-readable message */
	message: string;
	/** Stream-json event type: 'system', 'assistant', 'user', 'result' */
	eventType: string;
	/** Additional metadata (full content for expand-on-click) */
	metadata?: Record<string, any>;
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

	/** Input variables expected from task (shorthand or extended format) */
	inputs: Record<string, InputSpec>;

	/** Flow steps to execute */
	steps: FlowStep[];

	/**
	 * Auto-discovered inputs merged with explicit inputs (internal field)
	 * This field is populated during flow validation and contains the normalized
	 * form of all inputs (both explicit and auto-discovered)
	 */
	_autoDiscoveredInputs?: Record<string, NormalizedInputDefinition>;

	/** Optional lifecycle hooks */
	hooks?: FlowHooks;

	/** Optional status transitions configuration (defaults: onSuccess=review, onFailure=changes_requested) */
	statusTransitions?: StatusTransitions;

	/** Optional execution configuration for Claude CLI */
	execution?: ExecutionConfig;

	/** Optional trigger for automatic flow execution based on events */
	trigger?: FlowTrigger;

	/** Global environment variables injected into every step (supports ${{ }} templates). Step-level env takes precedence. */
	env?: Record<string, string>;
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

	/** Input variables with metadata (normalized form including auto-discovered inputs) */
	inputs: Record<string, NormalizedInputDefinition>;

	/** Workspace requirements */
	workspace: WorkspaceConfig;

	/** Optional status transitions configuration */
	statusTransitions?: StatusTransitions;

	/** Optional trigger for automatic flow execution */
	trigger?: FlowTrigger;

	/** Whether the flow passed validation */
	isValid: boolean;

	/** Validation errors (severity: 'error') - present only if isValid is false */
	validationErrors?: ValidationIssue[];

	/** Validation warnings (severity: 'warning') - present even if isValid is true */
	validationWarnings?: ValidationIssue[];
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

	/** Absolute path to workspace directory (where Claude works) */
	path: string;

	/** Absolute path to workspace metadata directory (engine-generated outputs, never inside workspaceDir) */
	metaDir: string;

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

// ─── Step Meta ────────────────────────────────────────────────────────────────

/** Base metadata available on every step type */
export interface StepMetaBase {
	duration_ms: number;
}

/** Metadata specific to script steps */
export interface ScriptStepMeta extends StepMetaBase {
	exit_code: number;
}

/** Metadata specific to model steps */
export interface ModelStepMeta extends StepMetaBase {
	/** Actual model used (may differ from config if fallback applied) */
	model: string;
	/** Claude session ID from system:init event — used for session continuation */
	session_id: string;
	/** Absolute path to the .jsonl session file (empty if not resolvable) */
	session_file: string;
	/** Time-to-first-token in ms */
	ttft_ms: number;
	cost: {
		input_tokens: number;
		output_tokens: number;
		usd: number;
	};
}

export type StepMeta = ScriptStepMeta | ModelStepMeta | StepMetaBase;

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Trace of a single step execution
 */
export interface StepTrace {
	/** Step identifier */
	stepId: string;

	/** Step name */
	stepName: string;

	/** Step type */
	stepType: 'model' | 'script' | 'subflow' | 'user_intervention';

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

	// User Intervention step fields
	/** Intervention type (for type='user_intervention') */
	interventionType?: 'approval' | 'question' | 'choice';

	/** Whether intervention blocks flow execution (for type='user_intervention') */
	interventionBlocking?: boolean;

	/** User's response to intervention (for type='user_intervention') */
	interventionResponse?: {
		value: any;
		comment?: string;
		answeredAt: string;
		answeredBy: string;
	};

	// Common fields
	/** Extracted output variables */
	outputs?: Record<string, any>;

	/** Error message if step failed */
	error?: string;

	/** Number of retry attempts */
	retries?: number;

	/** Live log entries streamed during model step execution */
	liveLogEntries?: LiveLogEntry[];

	/** Execution metadata (strongly typed per step type) */
	meta?: StepMeta;
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
