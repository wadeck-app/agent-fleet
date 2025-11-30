/**
 * Flow Validator
 *
 * Comprehensive validation of flow definitions with detailed error reporting.
 * Designed to collect ALL errors (not just the first) and provide rich metadata
 * for UI integration (workflow builder).
 *
 * Validation occurs in two phases:
 * 1. Schema Validation: Structure, required fields, types
 * 2. Semantic Validation: Variable references, cycles, type consistency
 */

import type {
  FlowDefinition,
  FlowStep,
  ModelFlowStep,
  ScriptFlowStep,
  WorkspaceMode,
  GitStrategy,
  ReusePolicy,
  ModelType,
  VariableType,
  StatusTransitions,
} from './types.js';
import { TaskStatus } from '../shared/types.js';

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

  // Semantic errors
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  UNREACHABLE_STEP = 'UNREACHABLE_STEP',
  NO_TERMINAL_STEP = 'NO_TERMINAL_STEP',
  TYPE_MISMATCH = 'TYPE_MISMATCH',

  // Template errors
  INVALID_TEMPLATE_SYNTAX = 'INVALID_TEMPLATE_SYNTAX',
  MALFORMED_EXPRESSION = 'MALFORMED_EXPRESSION',

  // Warnings
  UNUSED_INPUT = 'UNUSED_INPUT',
  UNUSED_OUTPUT = 'UNUSED_OUTPUT',
  MISSING_OUTPUT = 'MISSING_OUTPUT',
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
    expected?: any;

    /** Actual value/type */
    actual?: any;

    /** Related items (e.g., available steps, inputs) */
    related?: string[];

    /** Raw value for debugging */
    raw?: any;
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
 * Variable reference found in templates
 */
interface VariableReference {
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
 * Flow Validator
 */
export class FlowValidator {
  private issues: ValidationIssue[] = [];

  /**
   * Validate a flow definition completely
   */
  public validate(flow: FlowDefinition): ValidationResult {
    this.issues = [];

    // Phase 1: Schema validation
    this.validateSchema(flow);

    // Phase 2: Semantic validation (only if schema is valid enough)
    if (this.canProceedToSemantics()) {
      this.validateSemantics(flow);
    }

    return this.buildResult();
  }

  /**
   * Check if we can proceed to semantic validation
   * (basic structure must be valid)
   */
  private canProceedToSemantics(): boolean {
    const criticalErrors = this.issues.filter(
      (issue) =>
        issue.severity === 'error' &&
        (issue.code === ValidationCode.MISSING_FIELD ||
          issue.code === ValidationCode.EMPTY_COLLECTION)
    );
    return criticalErrors.length === 0;
  }

  /**
   * Build the final validation result
   */
  private buildResult(): ValidationResult {
    const summary = {
      errors: this.issues.filter((i) => i.severity === 'error').length,
      warnings: this.issues.filter((i) => i.severity === 'warning').length,
      info: this.issues.filter((i) => i.severity === 'info').length,
    };

    return {
      valid: summary.errors === 0,
      issues: this.issues,
      summary,
    };
  }

  /**
   * Add a validation issue
   */
  private addIssue(issue: ValidationIssue): void {
    this.issues.push(issue);
  }

  /**
   * Phase 1: Schema Validation
   */
  private validateSchema(flow: FlowDefinition): void {
    // Validate flow ID
    if (!flow.id || typeof flow.id !== 'string' || flow.id.trim() === '') {
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'Flow must have a non-empty ID',
        location: { field: 'id' },
        suggestion: 'Add a unique identifier for this flow (e.g., "my-flow")',
      });
    }

    // Validate flow name
    if (!flow.name || typeof flow.name !== 'string') {
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'Flow must have a name',
        location: { field: 'name' },
        suggestion: 'Add a descriptive name for this flow',
      });
    }

    // Validate description
    if (!flow.description || typeof flow.description !== 'string') {
      this.addIssue({
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

    // Validate steps
    this.validateSteps(flow.steps, flow.id);
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'statusTransitions must have onSuccess field',
        location: { field: 'statusTransitions.onSuccess' },
        suggestion: `Choose one of: ${validStatuses.join(', ')}`,
        context: { related: validStatuses },
      });
    } else if (!validStatuses.includes(config.onSuccess)) {
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'statusTransitions must have onFailure field',
        location: { field: 'statusTransitions.onFailure' },
        suggestion: `Choose one of: ${validStatuses.join(', ')}`,
        context: { related: validStatuses },
      });
    } else if (!validStatuses.includes(config.onFailure)) {
      this.addIssue({
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
   * Validate workspace configuration
   */
  private validateWorkspaceConfig(config: any, flowId: string): void {
    if (!config) {
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'Workspace must have a mode',
        location: { field: 'workspace.mode' },
        suggestion: `Choose one of: ${validModes.join(', ')}`,
        context: { related: validModes },
      });
    } else if (!validModes.includes(config.mode)) {
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'Workspace must have a git strategy',
        location: { field: 'workspace.gitStrategy' },
        suggestion: `Choose one of: ${validStrategies.join(', ')}`,
        context: { related: validStrategies },
      });
    } else if (!validStrategies.includes(config.gitStrategy)) {
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: 'Workspace must have a reuse policy',
        location: { field: 'workspace.reusePolicy' },
        suggestion: `Choose one of: ${validPolicies.join(', ')}`,
        context: { related: validPolicies },
      });
    } else if (!validPolicies.includes(config.reusePolicy)) {
      this.addIssue({
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
      this.addIssue({
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
   * Validate inputs
   */
  private validateInputs(inputs: Record<string, VariableType>, flowId: string): void {
    if (!inputs) {
      this.addIssue({
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
        this.addIssue({
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
   */
  private validateSteps(steps: FlowStep[], flowId: string): void {
    if (!steps || steps.length === 0) {
      this.addIssue({
        severity: 'error',
        code: ValidationCode.EMPTY_COLLECTION,
        message: 'Flow must have at least one step',
        location: { field: 'steps' },
        suggestion: 'Add steps to define the flow behavior',
      });
      return;
    }

    const stepIds = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Validate step ID
      if (!step.id || typeof step.id !== 'string' || step.id.trim() === '') {
        this.addIssue({
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
        this.addIssue({
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
        this.addIssue({
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

    // Store step IDs for reference validation
    (this as any)._stepIds = stepIds;
  }

  /**
   * Validate step based on type
   */
  private validateStepType(step: FlowStep): void {
    if (step.type === 'model') {
      this.validateModelStep(step);
    } else if (step.type === 'script') {
      this.validateScriptStep(step);
    } else {
      this.addIssue({
        severity: 'error',
        code: ValidationCode.INVALID_VALUE,
        message: `Invalid step type: ${(step as any).type}`,
        location: { stepId: (step as any).id, field: 'type' },
        suggestion: 'Type must be either "model" or "script"',
        context: {
          actual: (step as any).type,
          expected: ['model', 'script'],
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
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: `Model step '${step.id}' must specify a model`,
        location: { stepId: step.id, field: 'model' },
        suggestion: `Choose one of: ${validModels.join(', ')}`,
        context: { related: validModels },
      });
    } else if (!validModels.includes(step.model)) {
      this.addIssue({
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
      this.addIssue({
        severity: 'error',
        code: ValidationCode.MISSING_FIELD,
        message: `Script step '${step.id}' must have a non-empty script command`,
        location: { stepId: step.id, field: 'script' },
        suggestion: 'Add a shell command or script to execute',
      });
    }

    // Validate workingDir (optional, but should be string if present)
    if (step.workingDir !== undefined && typeof step.workingDir !== 'string') {
      this.addIssue({
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
      this.addIssue({
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
   * Phase 2: Semantic Validation
   */
  private validateSemantics(flow: FlowDefinition): void {
    const stepIds = (this as any)._stepIds as Set<string>;

    // Validate step references (next, conditions, previousOutputs)
    this.validateStepReferences(flow.steps, stepIds);

    // Validate template variables
    this.validateTemplateVariables(flow);

    // Detect cycles in flow transitions
    this.detectCycles(flow.steps);

    // Check for unreachable steps
    this.checkReachability(flow.steps);
  }

  /**
   * Validate step references
   */
  private validateStepReferences(steps: FlowStep[], stepIds: Set<string>): void {
    for (const step of steps) {
      // Validate depends
      if (step.depends) {
        for (let i = 0; i < step.depends.length; i++) {
          const depId = step.depends[i];
          if (!stepIds.has(depId)) {
            this.addIssue({
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
            this.addIssue({
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
    }
  }

  /**
   * Validate template variables in prompts and scripts
   */
  private validateTemplateVariables(flow: FlowDefinition): void {
    const inputNames = new Set(Object.keys(flow.inputs || {}));
    const stepIds = (this as any)._stepIds as Set<string>;

    // Collect all variable references
    const references = this.extractVariableReferences(flow);

    for (const ref of references) {
      if (ref.type === 'input') {
        // Validate input reference
        const inputName = ref.path[0];
        if (!inputNames.has(inputName)) {
          this.addIssue({
            severity: 'error',
            code: ValidationCode.UNDEFINED_INPUT,
            message: `Reference to undefined input: ${ref.expression}`,
            location: ref.location,
            suggestion: `Define input '${inputName}' or use an existing one: ${Array.from(inputNames).join(', ')}`,
            context: {
              actual: inputName,
              related: Array.from(inputNames),
            },
          });
        }
      } else if (ref.type === 'step') {
        // Validate step output reference
        const stepId = ref.path[0];
        if (!stepIds.has(stepId)) {
          this.addIssue({
            severity: 'error',
            code: ValidationCode.UNDEFINED_STEP,
            message: `Reference to undefined step: ${ref.expression}`,
            location: ref.location,
            suggestion: `Use an existing step: ${Array.from(stepIds).join(', ')}`,
            context: {
              actual: stepId,
              related: Array.from(stepIds),
            },
          });
        }
        // Note: We can't validate output field without execution, so we skip that
      } else if (ref.type === 'task') {
        // Task metadata is dynamic, so we just validate basic structure
        const validTaskFields = ['priority', 'metadata', 'id', 'createdAt'];
        const field = ref.path[0];
        if (!validTaskFields.includes(field) && field !== 'metadata') {
          this.addIssue({
            severity: 'warning',
            code: ValidationCode.UNDEFINED_VARIABLE,
            message: `Possible undefined task field: ${ref.expression}`,
            location: ref.location,
            suggestion: `Common task fields: ${validTaskFields.join(', ')}`,
            context: {
              actual: field,
              related: validTaskFields,
            },
          });
        }
      }
    }
  }

  /**
   * Extract all variable references from templates
   */
  private extractVariableReferences(flow: FlowDefinition): VariableReference[] {
    const references: VariableReference[] = [];

    // Template regex: ${{ ... }}
    const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;

    for (const step of flow.steps) {
      let text = '';

      // Get text to scan based on step type
      if (step.type === 'model') {
        text = step.prompt || '';
      } else if (step.type === 'script') {
        text = step.script || '';
      }

      // Find all template expressions
      let match;
      while ((match = templateRegex.exec(text)) !== null) {
        const expression = match[1].trim();
        const parsed = this.parseVariableExpression(expression);

        if (parsed) {
          references.push({
            expression,
            type: parsed.type,
            path: parsed.path,
            location: {
              stepId: step.id,
              field: step.type === 'model' ? 'prompt' : 'script',
            },
          });
        }
      }
    }

    return references;
  }

  /**
   * Parse a variable expression
   * Examples: "inputs.foo", "steps.bar.outputs.baz", "task.priority"
   */
  private parseVariableExpression(
    expression: string
  ): { type: 'input' | 'step' | 'task'; path: string[] } | null {
    const parts = expression.split('.');

    if (parts[0] === 'inputs') {
      return { type: 'input', path: parts.slice(1) };
    } else if (parts[0] === 'steps') {
      return { type: 'step', path: parts.slice(1) };
    } else if (parts[0] === 'task') {
      return { type: 'task', path: parts.slice(1) };
    }

    return null;
  }

  /**
   * Detect cycles in flow dependencies using DFS
   *
   * Note: This is a basic cycle check. Full DAG validation is done by DAGValidator
   * in the FlowExecutor. This is here for early detection during flow definition.
   */
  private detectCycles(steps: FlowStep[]): void {
    const graph = this.buildDependencyGraph(steps);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const stepId of graph.keys()) {
      if (!visited.has(stepId)) {
        const cycle = this.detectCycleDFS(stepId, graph, visited, recursionStack, []);
        if (cycle) {
          this.addIssue({
            severity: 'error',
            code: ValidationCode.CIRCULAR_DEPENDENCY,
            message: `Circular dependency detected: ${cycle.join(' → ')}`,
            location: { stepId: cycle[0] },
            suggestion: 'Remove or modify dependencies to break the cycle',
            context: { related: cycle },
          });
          return; // Report only first cycle
        }
      }
    }
  }

  /**
   * Build dependency graph for cycle detection
   */
  private buildDependencyGraph(steps: FlowStep[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const step of steps) {
      const dependencies = new Set<string>();

      if (step.depends) {
        for (const depId of step.depends) {
          dependencies.add(depId);
        }
      }

      graph.set(step.id, dependencies);
    }

    return graph;
  }

  /**
   * DFS for cycle detection
   */
  private detectCycleDFS(
    stepId: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] | null {
    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const dependencies = graph.get(stepId) || new Set();
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        const cycle = this.detectCycleDFS(depId, graph, visited, recursionStack, path);
        if (cycle) return cycle;
      } else if (recursionStack.has(depId)) {
        // Found cycle
        const cycleStart = path.indexOf(depId);
        return path.slice(cycleStart).concat(depId);
      }
    }

    recursionStack.delete(stepId);
    path.pop();
    return null;
  }

  /**
   * Check for unreachable steps
   *
   * In DAG-based flows, a step is unreachable if it has no path from any root node.
   * Root nodes are steps with no dependencies.
   */
  private checkReachability(steps: FlowStep[]): void {
    if (steps.length === 0) return;

    // Find root nodes (steps with no dependencies)
    const roots: string[] = [];
    for (const step of steps) {
      if (!step.depends || step.depends.length === 0) {
        roots.push(step.id);
      }
    }

    if (roots.length === 0) {
      // All steps have dependencies - likely a cycle
      this.addIssue({
        severity: 'error',
        code: ValidationCode.CIRCULAR_DEPENDENCY,
        message: 'No root steps found - all steps have dependencies (likely a circular dependency)',
        suggestion: 'At least one step should have no dependencies',
      });
      return;
    }

    // Build reverse graph (dependents)
    const dependents = new Map<string, Set<string>>();
    for (const step of steps) {
      dependents.set(step.id, new Set());
    }

    for (const step of steps) {
      if (step.depends) {
        for (const depId of step.depends) {
          const depsSet = dependents.get(depId);
          if (depsSet) {
            depsSet.add(step.id);
          }
        }
      }
    }

    // Mark all reachable steps from roots
    const reachable = new Set<string>();
    for (const rootId of roots) {
      this.markReachableFromRoot(rootId, dependents, reachable);
    }

    // Find unreachable steps
    for (const step of steps) {
      if (!reachable.has(step.id)) {
        this.addIssue({
          severity: 'warning',
          code: ValidationCode.UNREACHABLE_STEP,
          message: `Step '${step.id}' is unreachable (no path from root nodes)`,
          location: { stepId: step.id },
          suggestion: 'Ensure this step has a dependency path from at least one root step, or remove it',
        });
      }
    }
  }

  /**
   * Mark all reachable steps from a root node (following dependents)
   */
  private markReachableFromRoot(
    stepId: string,
    dependents: Map<string, Set<string>>,
    reachable: Set<string>
  ): void {
    if (reachable.has(stepId)) return;

    reachable.add(stepId);

    const deps = dependents.get(stepId) || new Set();
    for (const depId of deps) {
      this.markReachableFromRoot(depId, dependents, reachable);
    }
  }
}
