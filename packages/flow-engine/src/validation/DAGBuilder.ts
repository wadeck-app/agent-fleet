/**
 * DAG Builder
 *
 * Constructs a Directed Acyclic Graph (DAG) from flow steps and provides
 * utilities for topological sorting and finding ready steps.
 */
import type { DAG, DAGNode, FlowStep } from '../types';

/**
 * Error thrown when DAG construction fails
 */
export class DAGBuildError extends Error {
	constructor(
		message: string,
		public stepId?: string
	) {
		super(`DAG build error${stepId ? ` at step '${stepId}'` : ''}: ${message}`);
		this.name = 'DAGBuildError';
	}
}

/**
 * DAG Builder class
 */
export class DAGBuilder {
	/**
	 * Build a DAG from flow steps
	 *
	 * @param steps - Array of flow steps
	 * @returns Constructed DAG
	 * @throws DAGBuildError if dependencies are invalid
	 */
	public buildDAG(steps: FlowStep[]): DAG {
		if (steps.length === 0) {
			throw new DAGBuildError('Cannot build DAG from empty steps array');
		}

		// Create nodes map
		const nodes = new Map<string, DAGNode>();

		// First pass: Create all nodes
		for (const step of steps) {
			if (nodes.has(step.id)) {
				throw new DAGBuildError(`Duplicate step ID: ${step.id}`, step.id);
			}

			nodes.set(step.id, {
				step,
				dependencies: step.depends || [],
				dependents: [],
			});
		}

		// Second pass: Validate dependencies and build reverse edges
		for (const step of steps) {
			const node = nodes.get(step.id)!;

			for (const depId of node.dependencies) {
				const depNode = nodes.get(depId);
				if (!depNode) {
					throw new DAGBuildError(`Step '${step.id}' depends on non-existent step '${depId}'`, step.id);
				}

				// Add reverse edge (dependent)
				depNode.dependents.push(step.id);
			}
		}

		// Find root nodes (no dependencies)
		const roots: string[] = [];
		for (const [stepId, node] of nodes.entries()) {
			if (node.dependencies.length === 0) {
				roots.push(stepId);
			}
		}

		if (roots.length === 0) {
			throw new DAGBuildError('No root nodes found - all steps have dependencies (circular dependency)');
		}

		// Find leaf nodes (no dependents)
		const leaves: string[] = [];
		for (const [stepId, node] of nodes.entries()) {
			if (node.dependents.length === 0) {
				leaves.push(stepId);
			}
		}

		return {
			nodes,
			roots,
			leaves,
		};
	}

	/**
	 * Find all steps that are ready to execute
	 *
	 * A step is ready if all its dependencies have been completed.
	 *
	 * @param dag - The DAG
	 * @param completed - Set of completed step IDs
	 * @returns Array of steps ready to execute
	 */
	public findReadySteps(dag: DAG, completed: Set<string>): FlowStep[] {
		const ready: FlowStep[] = [];

		for (const [stepId, node] of dag.nodes.entries()) {
			// Skip if already completed
			if (completed.has(stepId)) {
				continue;
			}

			// Check if all dependencies are completed
			const allDepsCompleted = node.dependencies.every(depId => completed.has(depId));

			if (allDepsCompleted) {
				ready.push(node.step);
			}
		}

		return ready;
	}

	/**
	 * Perform topological sort on the DAG
	 *
	 * Returns step IDs in an order where dependencies come before dependents.
	 * Note: There may be multiple valid topological orderings.
	 *
	 * @param dag - The DAG to sort
	 * @returns Array of step IDs in topological order
	 * @throws DAGBuildError if a cycle is detected
	 */
	public topologicalSort(dag: DAG): string[] {
		const sorted: string[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (stepId: string): void => {
			if (visited.has(stepId)) {
				return;
			}

			if (visiting.has(stepId)) {
				throw new DAGBuildError(`Cycle detected involving step '${stepId}'`, stepId);
			}

			visiting.add(stepId);

			const node = dag.nodes.get(stepId);
			if (!node) {
				throw new DAGBuildError(`Step '${stepId}' not found in DAG`, stepId);
			}

			// Visit all dependencies first
			for (const depId of node.dependencies) {
				visit(depId);
			}

			visiting.delete(stepId);
			visited.add(stepId);
			sorted.push(stepId);
		};

		// Visit all nodes
		for (const stepId of dag.nodes.keys()) {
			visit(stepId);
		}

		return sorted;
	}

	/**
	 * Get all ancestors (transitive dependencies) of a step
	 *
	 * @param dag - The DAG
	 * @param stepId - Step ID to find ancestors for
	 * @returns Set of ancestor step IDs
	 */
	public getAncestors(dag: DAG, stepId: string): Set<string> {
		const ancestors = new Set<string>();
		const node = dag.nodes.get(stepId);

		if (!node) {
			throw new DAGBuildError(`Step '${stepId}' not found in DAG`, stepId);
		}

		const visit = (currentId: string): void => {
			const currentNode = dag.nodes.get(currentId);
			if (!currentNode) return;

			for (const depId of currentNode.dependencies) {
				if (!ancestors.has(depId)) {
					ancestors.add(depId);
					visit(depId);
				}
			}
		};

		visit(stepId);
		return ancestors;
	}

	/**
	 * Get all descendants (transitive dependents) of a step
	 *
	 * @param dag - The DAG
	 * @param stepId - Step ID to find descendants for
	 * @returns Set of descendant step IDs
	 */
	public getDescendants(dag: DAG, stepId: string): Set<string> {
		const descendants = new Set<string>();
		const node = dag.nodes.get(stepId);

		if (!node) {
			throw new DAGBuildError(`Step '${stepId}' not found in DAG`, stepId);
		}

		const visit = (currentId: string): void => {
			const currentNode = dag.nodes.get(currentId);
			if (!currentNode) return;

			for (const depId of currentNode.dependents) {
				if (!descendants.has(depId)) {
					descendants.add(depId);
					visit(depId);
				}
			}
		};

		visit(stepId);
		return descendants;
	}
}
