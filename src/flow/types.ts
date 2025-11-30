/**
 * Core type definitions for the Flow System
 *
 * This module defines all the core interfaces and types for the workflow engine,
 * including flow definitions, steps, workspaces, and execution traces.
 */

/**
 * Supported model types for step execution
 */
export type ModelType = 'sonnet' | 'haiku' | 'opus';

/**
 * Workspace modes determine isolation and concurrency behavior
 */
export type WorkspaceMode = 'isolated' | 'shared';

/**
 * Git strategy defines which branches can be used
 */
export type GitStrategy = 'main-only' | 'feature-branch' | 'any';

/**
 * Reuse policy determines when workspaces can be reused
 */
export type ReusePolicy = 'never' | 'if-available' | 'always';

/**
 * Variable types supported in flow inputs and outputs
 */
export type VariableType = 'string' | 'number' | 'boolean' | 'object';

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
export type ValidationRuleType =
  | 'required'
  | 'pattern'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'enum'
  | 'custom';

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

  /** Conditional transitions to next steps */
  next?: NextStepConfig;

  /** Retry configuration */
  retry?: RetryConfig;

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
 * Union type for all step types (discriminated by 'type' field)
 */
export type FlowStep = ModelFlowStep | ScriptFlowStep;

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
 * Complete flow definition
 */
export interface FlowDefinition {
  /** Unique flow identifier */
  id: string;

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
  stepType: 'model' | 'script';

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
