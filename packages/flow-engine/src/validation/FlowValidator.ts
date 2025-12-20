/**
 * Flow Validator Orchestrator
 *
 * Comprehensive validation of flow definitions with detailed error reporting.
 * Designed to collect ALL errors (not just the first) and provide rich metadata
 * for UI integration (workflow builder).
 *
 * This validator orchestrates four specialized validators:
 * 1. SchemaValidator - Structure, required fields, types
 * 2. GraphValidator - Cycles, reachability, DAG structure
 * 3. SemanticValidator - References, subflows, dependencies
 * 4. TemplateValidator - Variable expressions, template syntax
 *
 * Validation phases:
 * Phase 1: Schema validation (structural)
 * Phase 2: Graph validation (cycles, reachability) - only if schema valid
 * Phase 3: Semantic validation (references) - only if schema valid
 * Phase 4: Template validation (expressions) - only if schema valid
 */

import type { FlowDefinition } from '../types.js';
import type { FlowRegistry } from '../registry/FlowRegistry.js';

// Re-export types from ValidationTypes for backward compatibility
export type {
  ValidationSeverity,
  ValidationLocation,
  ValidationIssue,
  ValidationResult,
  VariableReference,
  IssueCollector,
} from './ValidationTypes.js';

export {
  ValidationCode,
} from './ValidationTypes.js';

// Import for internal use
import type {
  ValidationIssue,
  ValidationResult,
  IssueCollector,
} from './ValidationTypes.js';

import {
  ValidationCode,
} from './ValidationTypes.js';

// Import specialized validators
import { SchemaValidator } from './SchemaValidator.js';
import { GraphValidator } from './GraphValidator.js';
import { SemanticValidator } from './SemanticValidator.js';
import { TemplateValidator } from './TemplateValidator.js';

/**
 * Flow Validator - orchestrates specialized validators
 */
export class FlowValidator implements IssueCollector {
  private issues: ValidationIssue[] = [];
  private flowRegistry?: FlowRegistry;

  // Specialized validators
  private schemaValidator: SchemaValidator;
  private graphValidator: GraphValidator;
  private semanticValidator: SemanticValidator;
  private templateValidator: TemplateValidator;

  /**
   * Create a new FlowValidator
   * @param flowRegistry - Optional FlowRegistry for subflow validation
   */
  constructor(flowRegistry?: FlowRegistry) {
    this.flowRegistry = flowRegistry;

    // Initialize specialized validators with this as IssueCollector
    this.schemaValidator = new SchemaValidator(this);
    this.graphValidator = new GraphValidator(this, flowRegistry);
    this.semanticValidator = new SemanticValidator(this, this.graphValidator, flowRegistry);
    this.templateValidator = new TemplateValidator(this);
  }

  /**
   * Validate a flow definition completely
   * Orchestrates the four specialized validators in sequence
   */
  public validate(flow: FlowDefinition): ValidationResult {
    this.issues = [];

    // Phase 1: Schema validation (structural)
    const stepIds = this.schemaValidator.validateSchema(flow);

    // Early exit if critical errors prevent semantic validation
    if (!this.canProceedToSemantics()) {
      return this.buildResult();
    }

    // Phase 2: Graph validation (cycles, reachability)
    this.graphValidator.validateGraph(flow.steps);

    // Phase 3: Semantic validation (references)
    this.semanticValidator.validateSemantics(flow, stepIds);

    // Phase 4: Template validation (expressions)
    const inputNames = new Set(Object.keys(flow.inputs || {}));
    this.templateValidator.validateTemplates(flow, stepIds, inputNames);

    return this.buildResult();
  }

  /**
   * Add a validation issue (IssueCollector interface)
   * Called by specialized validators to report issues
   */
  public addIssue(issue: ValidationIssue): void {
    this.issues.push(issue);
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
}
