/**
 * Shared Validation Types
 *
 * Common type definitions and enums used across all flow validators.
 * These types are shared by SchemaValidator, SemanticValidator,
 * TemplateValidator, GraphValidator, and the main FlowValidator orchestrator.
 */

/**
 * Validation issue severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation issue codes for programmatic handling
 */
export enum ValidationCode {
	// Schema errors
	MISSING_FIELD = 'MISSING_FIELD',
	INVALID_TYPE = 'INVALID_TYPE',
	INVALID_VALUE = 'INVALID_VALUE',
	DUPLICATE_ID = 'DUPLICATE_ID',
	EMPTY_COLLECTION = 'EMPTY_COLLECTION',

	// Reference errors
	UNDEFINED_STEP = 'UNDEFINED_STEP',
	UNDEFINED_INPUT = 'UNDEFINED_INPUT',
	UNDEFINED_OUTPUT = 'UNDEFINED_OUTPUT',
	UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
	UNDEFINED_FLOW = 'UNDEFINED_FLOW',

	// Semantic errors
	CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
	CIRCULAR_SUBFLOW_REFERENCE = 'CIRCULAR_SUBFLOW_REFERENCE',
	UNREACHABLE_STEP = 'UNREACHABLE_STEP',
	NO_TERMINAL_STEP = 'NO_TERMINAL_STEP',
	TYPE_MISMATCH = 'TYPE_MISMATCH',
	INCOMPATIBLE_PROVIDER_MODEL = 'INCOMPATIBLE_PROVIDER_MODEL',

	// Template errors
	INVALID_TEMPLATE_SYNTAX = 'INVALID_TEMPLATE_SYNTAX',
	MALFORMED_EXPRESSION = 'MALFORMED_EXPRESSION',
	UNDECLARED_OUTPUT_KEY = 'UNDECLARED_OUTPUT_KEY',

	// Secret errors (type: password inputs and the steps that use them)
	SECRET_UNKNOWN = 'SECRET_UNKNOWN',
	SECRET_INVALID_NAME = 'SECRET_INVALID_NAME',
	SECRET_FORBIDDEN_STEP = 'SECRET_FORBIDDEN_STEP',
	SECRET_BAD_REFERENCE = 'SECRET_BAD_REFERENCE',

	// Sub-step strategy and waves errors
	SUB_STEP_STRATEGY_UNKNOWN = 'SUB_STEP_STRATEGY_UNKNOWN',
	SUB_STEP_WAVE_MISSING = 'SUB_STEP_WAVE_MISSING',
	SUB_STEP_WAVE_WITHOUT_PARENT = 'SUB_STEP_WAVE_WITHOUT_PARENT',
	SUB_STEP_WAVE_STRATEGY_MISMATCH = 'SUB_STEP_WAVE_STRATEGY_MISMATCH',
	SUB_STEP_WAVE_NESTED = 'SUB_STEP_WAVE_NESTED',
	SUB_STEP_WAVE_INVALID = 'SUB_STEP_WAVE_INVALID',
	WAVE_LATER_DEPENDS = 'WAVE_LATER_DEPENDS',

	// Warnings
	SUB_STEP_WAVES_SINGLE_WAVE = 'SUB_STEP_WAVES_SINGLE_WAVE',
	WAVE_REDUNDANT_DEPENDS = 'WAVE_REDUNDANT_DEPENDS',
	SECRET_IN_SCRIPT_TEXT = 'SECRET_IN_SCRIPT_TEXT',
	UNUSED_INPUT = 'UNUSED_INPUT',
	UNUSED_OUTPUT = 'UNUSED_OUTPUT',
	MISSING_OUTPUT = 'MISSING_OUTPUT',
	SUB_STEP_SIBLING_DEPENDENCY = 'SUB_STEP_SIBLING_DEPENDENCY',
	OPENCODE_SHELL_NOT_FOUND = 'OPENCODE_SHELL_NOT_FOUND',

	// Info
	AUTO_DISCOVERED_INPUT = 'AUTO_DISCOVERED_INPUT',
}

/**
 * Location information for validation issues
 */
export interface ValidationLocation {
	/** Step ID where the issue occurs */
	stepId?: string;

	/** Specific field within the step */
	field?: string;

	/** Line number in YAML file (if available) */
	line?: number;

	/** Column number in YAML file (if available) */
	column?: number;

	/** Path to the issue (e.g., "steps[2].output.foo") */
	path?: string;
}

/**
 * A single validation issue
 */
export interface ValidationIssue {
	/** Severity level */
	severity: ValidationSeverity;

	/** Machine-readable error code */
	code: ValidationCode;

	/** Human-readable message */
	message: string;

	/** Location of the issue */
	location?: ValidationLocation;

	/** Suggested fix */
	suggestion?: string;

	/** Additional context for UI */
	context?: {
		/** Expected value/type */
		expected?: unknown;

		/** Actual value/type */
		actual?: unknown;

		/** Related items (e.g., available steps, inputs) */
		related?: string[];

		/** Raw value for debugging */
		raw?: unknown;
	};
}

/**
 * Result of flow validation
 */
export interface ValidationResult {
	/** Whether the flow is valid (no errors) */
	valid: boolean;

	/** All validation issues found */
	issues: ValidationIssue[];

	/** Count by severity */
	summary: {
		errors: number;
		warnings: number;
		info: number;
	};
}

/**
 * Variable reference found in templates (internal type)
 */
export interface VariableReference {
	/** Full expression: inputs.foo, steps.bar.outputs.baz, task.priority */
	expression: string;

	/** Type: 'input', 'step', 'task' */
	type: 'input' | 'step' | 'task';

	/** Variable name or path */
	path: string[];

	/** Location where used */
	location: ValidationLocation;
}

/**
 * Issue collector interface for validators
 */
export interface IssueCollector {
	addIssue(issue: ValidationIssue): void;
}
