/**
 * Template Renderer (GitHub Actions syntax)
 *
 * Handles variable interpolation in prompts and strings using GitHub Actions syntax.
 * Supports:
 * - ${{ inputs.varName }} - variables from flow inputs
 * - ${{ steps.stepId.outputs.varName }} - outputs from previous steps
 * - ${{ task.metadata.key }} - task metadata access
 * - ${{ subSteps.stepId.outputs.varName }} - outputs from a failed sub-step (parent restart)
 * - ${{ subSteps.stepId.status.failed }} - whether a sub-step failed (boolean as string)
 * - {% if expr %}...{% endif %} / {% if expr %}...{% else %}...{% endif %} - conditional blocks
 */

/**
 * Context for template rendering
 */
export interface TemplateContext {
	/** Input variables from the flow */
	inputs: Record<string, any>;

	/** Outputs from completed steps (keyed by step ID) */
	stepOutputs: Map<string, Record<string, any>>;

	/** Execution metadata for completed steps (keyed by step ID) */
	stepMeta?: Map<string, Record<string, unknown>>;

	/** Task metadata (priority, createdAt, etc.) */
	taskMetadata: Record<string, any>;

	/** Current nesting depth for SubFlowStep recursion tracking */
	nestingDepth?: number;

	/** Task ID for the current execution */
	taskId?: string;

	/** Worker ID (if applicable) */
	workerId?: string;

	/** Flow ID being executed */
	flowId?: string;

	/** Claude environment variables */
	claudeEnv?: Record<string, string>;

	/** Execution context variables (e.g. cwd) accessible via ${{ context.* }} */
	context?: Record<string, string>;

	/** Sub-step results accessible by sub-step ID when parent step is restarting */
	subSteps?: Map<string, { outputs: Record<string, any>; status: string }>;

	/** Callback when Claude process starts */
	onClaudeProcessStarted?: (process: any) => void;
}

/**
 * Template rendering error
 */
export class TemplateRenderError extends Error {
	constructor(
		message: string,
		public template: string,
		public variable: string
	) {
		super(`Template render error: ${message}`);
		this.name = 'TemplateRenderError';
	}
}

/**
 * Template Renderer class
 */
export class TemplateRenderer {
	/**
	 * Render a template string with variable interpolation
	 *
	 * @param template - Template string with ${{ expression }} placeholders
	 * @param context - Context containing variables
	 * @param strict - If true, throw error on missing variables (default: true)
	 * @returns Rendered string
	 */
	public render(template: string, context: TemplateContext, strict: boolean = true): string {
		// 1. Replace $${{ ... }} with null-byte placeholders so they survive template
		//    processing unchanged. After all ${{ }} expressions are resolved, each
		//    placeholder is restored as a literal ${{ ... }} in the output.
		//    This lets users write $${{ inputs.taskId }} to produce ${{ inputs.taskId }}.
		const escapedLiterals: string[] = [];
		const escapedTemplate = template.replace(/\$\$\{\{(.*?)\}\}/g, (_, inner: string) => {
			const index = escapedLiterals.length;
			escapedLiterals.push(`\${{${inner}}}`);
			return `\x00ESCAPED_EXPR_${index}\x00`;
		});

		// 2. Process {% if/else/endif %} blocks before interpolation so discarded branches
		//    do not trigger errors for missing variables.
		let result = this.processBlocks(escapedTemplate, context, strict);

		// 3. Find all ${{ ... }} patterns (GitHub Actions syntax)
		const pattern = /\$\{\{\s*([^}]+?)\s*\}\}/g;
		let match: RegExpExecArray | null;
		const after = result;

		// Reset lastIndex for global regex
		pattern.lastIndex = 0;

		while ((match = pattern.exec(after)) !== null) {
			const placeholder = match[0]; // e.g., "${{ foo.bar }}"
			const expression = match[1].trim(); // e.g., "foo.bar"

			try {
				const value = this.resolveVariable(expression, context);
				result = result.replace(placeholder, this.formatValue(value));
			} catch (error) {
				if (strict) {
					throw error;
				} else {
					// In non-strict mode, leave placeholder as-is
					console.warn(`Failed to resolve ${placeholder}:`, error);
				}
			}
		}

		// 4. Restore escaped literals as their literal ${{ ... }} form
		for (let i = 0; i < escapedLiterals.length; i++) {
			result = result.replace(`\x00ESCAPED_EXPR_${i}\x00`, escapedLiterals[i]!);
		}

		return result;
	}

	/**
	 * Process {% if expr %}...{% else %}...{% endif %} block conditionals.
	 * Evaluated before ${{ }} interpolation so discarded branches are not parsed.
	 */
	private processBlocks(template: string, context: TemplateContext, strict: boolean): string {
		const blockPattern = /\{%\s*if\s+(.+?)\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g;
		return template.replace(blockPattern, (_, expr: string, ifContent: string, elseContent?: string) => {
			let condValue: unknown;
			try {
				condValue = this.resolveVariable(expr.trim(), context);
			} catch {
				// Condition evaluation failure is always treated as falsy regardless of strict mode.
				// This allows {% if subSteps.xxx.status.failed %} blocks to work gracefully on
				// the first parent run before any sub-step has executed (subSteps absent from context).
				// The strict parameter still governs ${{ }} interpolation errors below.
				condValue = false;
			}
			const isTruthy =
				condValue !== false &&
				condValue !== 'false' &&
				condValue !== '' &&
				condValue !== null &&
				condValue !== undefined &&
				condValue !== 0;
			const content = isTruthy ? ifContent : (elseContent ?? '');
			// Trim one leading/trailing newline from block content
			return content.replace(/^\n/, '').replace(/\n$/, '');
		});
	}

	/**
	 * Resolve a variable expression to its value (GitHub Actions syntax)
	 *
	 * @param expression - Variable expression (e.g., "inputs.name", "steps.build.outputs.version", "task.priority")
	 * @param context - Template context
	 * @returns Resolved value
	 */
	private resolveVariable(expression: string, context: TemplateContext): any {
		const parts = expression.split('.');
		const root = parts[0];

		if (root === 'inputs') {
			// ${{ inputs.varName }}
			if (parts.length < 2) {
				throw new TemplateRenderError('inputs requires a variable name: inputs.varName', expression, root);
			}
			const path = parts.slice(1);
			return this.resolveNested(context.inputs, path, expression);
		} else if (root === 'steps') {
			// ${{ steps.stepId.outputs.varName }} or ${{ steps.stepId.meta.field }}
			if (parts.length < 4 || (parts[2] !== 'outputs' && parts[2] !== 'meta')) {
				throw new TemplateRenderError(
					'steps requires format: steps.stepId.outputs.varName or steps.stepId.meta.field',
					expression,
					root
				);
			}
			const stepId = parts[1];
			const namespace = parts[2];

			if (namespace === 'meta') {
				const meta = context.stepMeta?.get(stepId);
				if (!meta) {
					throw new TemplateRenderError(`Step '${stepId}' not found or has no meta`, expression, stepId);
				}
				const path = parts.slice(3);
				return this.resolveNested(meta, path, expression);
			}

			const stepOutputs = context.stepOutputs.get(stepId);
			if (!stepOutputs) {
				throw new TemplateRenderError(`Step '${stepId}' not found or has no outputs`, expression, stepId);
			}
			const path = parts.slice(3); // Skip 'steps', 'stepId', 'outputs'
			return this.resolveNested(stepOutputs, path, expression);
		} else if (root === 'task') {
			// ${{ task.priority }} or ${{ task.metadata.key }}
			if (parts.length < 2) {
				throw new TemplateRenderError('task requires a property: task.priority', expression, root);
			}
			const path = parts.slice(1);
			return this.resolveNested(context.taskMetadata, path, expression);
		} else if (root === 'context') {
			// ${{ context.cwd }} or other execution context values
			if (parts.length < 2) {
				throw new TemplateRenderError('context requires a property: context.cwd', expression, root);
			}
			const path = parts.slice(1);
			return this.resolveNested(context.context ?? {}, path, expression);
		} else if (root === 'subSteps') {
			// ${{ subSteps.stepId.outputs.varName }} or ${{ subSteps.stepId.status.failed }}
			if (parts.length < 4 || (parts[2] !== 'outputs' && parts[2] !== 'status')) {
				throw new TemplateRenderError(
					'subSteps requires format: subSteps.stepId.outputs.varName or subSteps.stepId.status.failed',
					expression,
					root
				);
			}
			const stepId = parts[1]!;
			const namespace = parts[2]!;
			const subStep = context.subSteps?.get(stepId);
			if (!subStep) {
				// Sub-step not in context (first run or no failure yet) — return neutral values
				return namespace === 'status' ? false : '';
			}
			if (namespace === 'outputs') {
				const varName = parts[3]!;
				// Missing output key — return empty string rather than crashing the parent
				return varName in subStep.outputs ? subStep.outputs[varName] : '';
			} else {
				// namespace === 'status'
				if (parts[3] !== 'failed') {
					throw new TemplateRenderError(
						`Unknown status property '${parts[3]}'. Only 'failed' is supported`,
						expression,
						parts[3]!
					);
				}
				return subStep.status === 'failed';
			}
		} else {
			throw new TemplateRenderError(
				`Unknown root context: '${root}'. Use 'inputs', 'steps', 'task', 'context', or 'subSteps'`,
				expression,
				root
			);
		}
	}

	/**
	 * Resolve nested object access (e.g., task.metadata.key)
	 *
	 * @param obj - Object to traverse
	 * @param path - Array of keys to access
	 * @param fullExpression - Full expression for error messages
	 * @returns Resolved value
	 */
	private resolveNested(obj: any, path: string[], fullExpression: string): any {
		let current = obj;

		for (const key of path) {
			if (current === null || current === undefined) {
				throw new TemplateRenderError(`Cannot access '${key}' on null/undefined`, fullExpression, key);
			}

			if (typeof current !== 'object') {
				throw new TemplateRenderError(`Cannot access '${key}' on non-object value`, fullExpression, key);
			}

			if (!(key in current)) {
				throw new TemplateRenderError(`Property '${key}' not found`, fullExpression, key);
			}

			current = current[key];
		}

		return current;
	}

	/**
	 * Format a value for string interpolation
	 *
	 * @param value - Value to format
	 * @returns String representation
	 */
	private formatValue(value: any): string {
		if (value === null) {
			return 'null';
		}
		if (value === undefined) {
			return 'undefined';
		}
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		if (typeof value === 'object') {
			// For objects and arrays, use JSON representation
			return JSON.stringify(value, null, 2);
		}
		return String(value);
	}

	/**
	 * Check if a template contains any variables
	 *
	 * @param template - Template string to check
	 * @returns True if template has variables
	 */
	public hasVariables(template: string): boolean {
		return /\$\{\{[^}]+\}\}/.test(template);
	}

	/**
	 * Extract all variable names from a template
	 *
	 * @param template - Template string
	 * @returns Array of variable expressions found
	 */
	public extractVariables(template: string): string[] {
		const pattern = /\$\{\{\s*([^}]+?)\s*\}\}/g;
		const variables: string[] = [];
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(template)) !== null) {
			variables.push(match[1].trim());
		}

		return variables;
	}
}
