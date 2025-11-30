/**
 * DAG Validator
 *
 * Validates DAG structure for cycles, unreachable steps, and other issues.
 */

import type { DAG } from './types.js';

/**
 * Validation issue severity levels
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Severity level */
  severity: ValidationSeverity;

  /** Issue type/code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Related step IDs */
  stepIds?: string[];
}

/**
 * Result of DAG validation
 */
export interface ValidationResult {
  /** Whether the DAG is valid (no errors) */
  valid: boolean;

  /** List of validation issues */
  issues: ValidationIssue[];

  /** Error issues only */
  errors: ValidationIssue[];

  /** Warning issues only */
  warnings: ValidationIssue[];
}

/**
 * DAG Validator class
 */
export class DAGValidator {
  /**
   * Validate a DAG and return all issues
   *
   * @param dag - The DAG to validate
   * @returns Validation result
   */
  public validate(dag: DAG): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check for cycles
    const cycles = this.detectCycles(dag);
    if (cycles) {
      for (const cycle of cycles) {
        issues.push({
          severity: 'error',
          code: 'CYCLE_DETECTED',
          message: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
          stepIds: cycle,
        });
      }
    }

    // Check for unreachable steps
    const unreachable = this.findUnreachableSteps(dag);
    if (unreachable.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'UNREACHABLE_STEPS',
        message: `Steps are unreachable (no path from root nodes): ${unreachable.join(', ')}`,
        stepIds: unreachable,
      });
    }

    // Check for disconnected subgraphs
    const disconnected = this.findDisconnectedSteps(dag);
    if (disconnected.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'DISCONNECTED_STEPS',
        message: `Steps are disconnected from the main flow: ${disconnected.join(', ')}`,
        stepIds: disconnected,
      });
    }

    // Separate errors and warnings
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      issues,
      errors,
      warnings,
    };
  }

  /**
   * Detect cycles in the DAG using DFS
   *
   * @param dag - The DAG to check
   * @returns Array of cycles (each cycle is an array of step IDs), or null if no cycles
   */
  public detectCycles(dag: DAG): string[][] | null {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const cycles: string[][] = [];

    const visit = (stepId: string, path: string[]): void => {
      if (visited.has(stepId)) {
        return;
      }

      if (visiting.has(stepId)) {
        // Cycle detected - extract the cycle from the path
        const cycleStartIndex = path.indexOf(stepId);
        const cycle = path.slice(cycleStartIndex);
        cycles.push(cycle);
        return;
      }

      visiting.add(stepId);
      path.push(stepId);

      const node = dag.nodes.get(stepId);
      if (node) {
        for (const depId of node.dependencies) {
          visit(depId, [...path]);
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
    };

    // Start from all nodes to catch disconnected cycles
    for (const stepId of dag.nodes.keys()) {
      if (!visited.has(stepId)) {
        visit(stepId, []);
      }
    }

    return cycles.length > 0 ? cycles : null;
  }

  /**
   * Find steps that are unreachable from root nodes
   *
   * @param dag - The DAG to check
   * @returns Array of unreachable step IDs
   */
  public findUnreachableSteps(dag: DAG): string[] {
    const reachable = new Set<string>();

    const visit = (stepId: string): void => {
      if (reachable.has(stepId)) {
        return;
      }

      reachable.add(stepId);

      const node = dag.nodes.get(stepId);
      if (node) {
        for (const depId of node.dependents) {
          visit(depId);
        }
      }
    };

    // Start from all root nodes
    for (const rootId of dag.roots) {
      visit(rootId);
    }

    // Find nodes that weren't reached
    const unreachable: string[] = [];
    for (const stepId of dag.nodes.keys()) {
      if (!reachable.has(stepId)) {
        unreachable.push(stepId);
      }
    }

    return unreachable;
  }

  /**
   * Find steps that are disconnected (not reachable from roots and don't reach leaves)
   *
   * @param dag - The DAG to check
   * @returns Array of disconnected step IDs
   */
  public findDisconnectedSteps(dag: DAG): string[] {
    // Steps reachable from roots
    const reachableFromRoots = new Set<string>();
    const visitForward = (stepId: string): void => {
      if (reachableFromRoots.has(stepId)) return;
      reachableFromRoots.add(stepId);
      const node = dag.nodes.get(stepId);
      if (node) {
        for (const depId of node.dependents) {
          visitForward(depId);
        }
      }
    };

    for (const rootId of dag.roots) {
      visitForward(rootId);
    }

    // Steps that can reach leaves
    const canReachLeaves = new Set<string>();
    const visitBackward = (stepId: string): void => {
      if (canReachLeaves.has(stepId)) return;
      canReachLeaves.add(stepId);
      const node = dag.nodes.get(stepId);
      if (node) {
        for (const depId of node.dependencies) {
          visitBackward(depId);
        }
      }
    };

    for (const leafId of dag.leaves) {
      visitBackward(leafId);
    }

    // Find steps that are either unreachable from roots OR can't reach leaves
    const disconnected: string[] = [];
    for (const stepId of dag.nodes.keys()) {
      if (!reachableFromRoots.has(stepId) || !canReachLeaves.has(stepId)) {
        disconnected.push(stepId);
      }
    }

    return disconnected;
  }

  /**
   * Check if a specific dependency exists (directly or transitively)
   *
   * @param dag - The DAG
   * @param fromStepId - Starting step
   * @param toStepId - Target step
   * @returns True if there's a path from fromStepId to toStepId
   */
  public hasDependencyPath(dag: DAG, fromStepId: string, toStepId: string): boolean {
    if (fromStepId === toStepId) {
      return true;
    }

    const visited = new Set<string>();

    const visit = (currentId: string): boolean => {
      if (currentId === toStepId) {
        return true;
      }

      if (visited.has(currentId)) {
        return false;
      }

      visited.add(currentId);

      const node = dag.nodes.get(currentId);
      if (node) {
        for (const depId of node.dependencies) {
          if (visit(depId)) {
            return true;
          }
        }
      }

      return false;
    };

    return visit(fromStepId);
  }
}
