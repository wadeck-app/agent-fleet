/**
 * Graph Validator
 *
 * Validates the graph structure of flow definitions:
 * - Detects cycles in step dependencies using DFS
 * - Checks step reachability from root nodes
 * - Validates DAG structure (Directed Acyclic Graph)
 * - Detects circular subflow dependencies (deep chain detection)
 *
 * This validator focuses on the structural integrity of the flow's execution graph.
 */
import type { FlowRegistry } from '../registry/FlowRegistry.js';
import type { FlowStep, SubFlowStep } from '../types.js';
import type { IssueCollector } from './ValidationTypes.js';
import { ValidationCode } from './ValidationTypes.js';

/**
 * Graph Validator - validates flow graph structure
 */
export class GraphValidator {
	/**
	 * Create a new GraphValidator
	 * @param issueCollector - Collector for validation issues
	 * @param flowRegistry - Optional registry for subflow validation
	 */
	constructor(
		private issueCollector: IssueCollector,
		private flowRegistry?: FlowRegistry
	) {}

	/**
	 * Validate the complete graph structure of a flow
	 * Checks for cycles and unreachable steps
	 * @param steps - Flow steps to validate
	 */
	public validateGraph(steps: FlowStep[]): void {
		// Detect cycles in flow dependencies
		this.detectCycles(steps);

		// Check for unreachable steps
		this.checkReachability(steps);
	}

	/**
	 * Validate if a subflow step creates circular dependency
	 * This should be called by SemanticValidator before checking flow existence
	 *
	 * @param step - SubFlow step to validate
	 * @param currentFlowId - ID of the flow containing this step
	 * @returns true if circular dependency detected, false otherwise
	 */
	public validateSubFlowCircularity(step: SubFlowStep, currentFlowId: string): boolean {
		// Check for direct circular reference (flow calling itself)
		if (step.flowId === currentFlowId) {
			// Direct recursion detected
			if (step.allowRecursion === true) {
				// Recursion is explicitly allowed - just add a warning about best practices
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.CIRCULAR_SUBFLOW_REFERENCE,
					message: `SubFlow step '${step.id}' is recursive (flow '${currentFlowId}' calls itself). Ensure proper exit condition via 'when' clause to prevent infinite loops.`,
					location: { stepId: step.id, field: 'flowId' },
					suggestion: 'Add a "when" condition to ensure recursion eventually stops',
				});
				// Continue validation - recursion is allowed
				return false;
			} else {
				// Recursion is NOT allowed - error
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.CIRCULAR_SUBFLOW_REFERENCE,
					message: `SubFlow step '${step.id}' creates circular reference (flow '${currentFlowId}' calls itself)`,
					location: { stepId: step.id, field: 'flowId' },
					suggestion: 'Add "allowRecursion: true" if recursion is intentional, or use a different flow',
				});
				return true; // Circular
			}
		}

		// Detect deep circular dependencies (if registry is available)
		// Skip this check for direct self-references (already handled above)
		if (this.flowRegistry && step.flowId !== currentFlowId) {
			const visited = new Set<string>();
			const path: string[] = [];
			if (this.detectCircularSubFlowDependency(step.flowId, currentFlowId, visited, path)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.CIRCULAR_SUBFLOW_REFERENCE,
					message: `SubFlow step '${step.id}' creates circular dependency chain: ${path.join(' → ')} → ${currentFlowId}`,
					location: { stepId: step.id, field: 'flowId' },
					suggestion: 'Break the circular chain by restructuring the flow composition',
					context: { related: path },
				});
				return true; // Circular
			}
		}

		return false; // Not circular
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
					this.issueCollector.addIssue({
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
			this.issueCollector.addIssue({
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
				this.issueCollector.addIssue({
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
	private markReachableFromRoot(stepId: string, dependents: Map<string, Set<string>>, reachable: Set<string>): void {
		if (reachable.has(stepId)) return;

		reachable.add(stepId);

		const deps = dependents.get(stepId) || new Set();
		for (const depId of deps) {
			this.markReachableFromRoot(depId, dependents, reachable);
		}
	}

	/**
	 * Detect circular dependencies in SubFlowStep chains
	 *
	 * This performs a depth-first search through the flow composition graph to detect cycles.
	 * Example: Flow A calls Flow B, which calls Flow C, which calls Flow A → circular!
	 *
	 * @param flowId - The flow ID to check (starting point)
	 * @param targetFlowId - The flow ID we're looking for (to detect a cycle)
	 * @param visited - Set of already visited flow IDs (to avoid infinite loops)
	 * @param path - Current path through the flow graph (for error reporting)
	 * @returns true if a circular dependency is detected, false otherwise
	 */
	private detectCircularSubFlowDependency(
		flowId: string,
		targetFlowId: string,
		visited: Set<string>,
		path: string[]
	): boolean {
		// If we've already visited this flow in the current path, stop here
		if (visited.has(flowId)) {
			return false;
		}

		// If we found the target flow, we have a cycle!
		if (flowId === targetFlowId) {
			return true;
		}

		// Mark this flow as visited
		visited.add(flowId);
		path.push(flowId);

		// Get the flow definition
		if (!this.flowRegistry) {
			return false;
		}

		const flow = this.flowRegistry.getFlow(flowId);
		if (!flow) {
			return false;
		}

		// Check all SubFlowSteps in this flow
		for (const step of flow.steps) {
			if (step.type === 'subflow') {
				const subFlowStep = step as SubFlowStep;

				// Recursively check if this subflow leads to the target
				// Create a new visited set for each branch to allow multiple paths
				const newVisited = new Set(visited);
				const newPath = [...path];

				if (this.detectCircularSubFlowDependency(subFlowStep.flowId, targetFlowId, newVisited, newPath)) {
					// Copy the found path back
					path.length = 0;
					path.push(...newPath);
					return true;
				}
			}
		}

		return false;
	}
}
