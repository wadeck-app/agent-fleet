/**
 * Loop Handler
 *
 * Manages feedback loops in flow execution using the `goto` mechanism.
 *
 * Features:
 * - Detects when a step failure should trigger a loop back
 * - Enforces maxIterations limits to prevent infinite loops
 * - Invalidates target step and all descendants for re-execution
 * - Tracks per-step iteration counts and total loop count
 *
 * Design Decision: Loops only trigger on step FAILURE (exitCode !== 0 or error thrown).
 * Conditional goto based on outputs is deferred to Phase 5 with `when` expressions.
 */
import type { DAG, FlowStep, StepTrace } from '../types';
import { DAGBuilder } from '../validation/DAGBuilder';

/**
 * Result of checking if a loop should be triggered
 */
export interface LoopCheckResult {
	/** Whether a loop should be triggered */
	shouldLoop: boolean;

	/** Target step ID to jump back to (if shouldLoop is true) */
	targetStepId?: string;

	/** Reason why loop cannot be triggered (if shouldLoop is false) */
	reason?: string;
}

/**
 * Result of handling a loop
 */
export interface LoopHandleResult {
	/** Whether the loop was successfully handled */
	success: boolean;

	/** Steps that were invalidated (need to be re-executed) */
	invalidatedSteps: string[];

	/** Steps that should be skipped (have skipOnLoop=true) */
	skippedSteps: string[];

	/** Current iteration count for the step that triggered the loop */
	currentIteration: number;

	/** Error message if loop handling failed */
	error?: string;
}

/**
 * Loop Handler class
 */
export class LoopHandler {
	private dagBuilder: DAGBuilder;

	constructor() {
		this.dagBuilder = new DAGBuilder();
	}

	/**
	 * Check if a step failure should trigger a loop
	 *
	 * @param step - The step that failed
	 * @param stepTrace - Trace of the failed step execution
	 * @param iterations - Current iteration counts for all steps
	 * @returns Loop check result
	 */
	public checkLoop(step: FlowStep, stepTrace: StepTrace, iterations: Map<string, number>): LoopCheckResult {
		// Check if step has onFailure.goto configured
		if (!step.onFailure?.goto) {
			return {
				shouldLoop: false,
				reason: 'No onFailure.goto configured for this step',
			};
		}

		// Check if step actually failed
		if (!stepTrace.error) {
			return {
				shouldLoop: false,
				reason: 'Step did not fail (no error in stepTrace)',
			};
		}

		const targetStepId = step.onFailure.goto;
		const maxIterations = step.onFailure.maxIterations ?? 3; // Default: 3
		const currentIteration = iterations.get(step.id) || 0;

		// Check if we've exceeded maxIterations
		if (currentIteration >= maxIterations) {
			return {
				shouldLoop: false,
				reason: `Max iterations (${maxIterations}) exceeded for step '${step.id}' (current: ${currentIteration})`,
			};
		}

		// All checks passed - we should loop
		return {
			shouldLoop: true,
			targetStepId,
		};
	}

	/**
	 * Handle a loop: invalidate target step and descendants, update iteration counts
	 *
	 * @param step - The step that triggered the loop
	 * @param targetStepId - Step ID to jump back to
	 * @param dag - DAG of the flow
	 * @param completed - Set of completed step IDs
	 * @param iterations - Iteration counts for all steps
	 * @returns Loop handle result
	 */
	public handleLoop(
		step: FlowStep,
		targetStepId: string,
		dag: DAG,
		completed: Set<string>,
		iterations: Map<string, number>
	): LoopHandleResult {
		// Validate target step exists in DAG
		const targetNode = dag.nodes.get(targetStepId);
		if (!targetNode) {
			return {
				success: false,
				invalidatedSteps: [],
				skippedSteps: [],
				currentIteration: iterations.get(step.id) || 0,
				error: `Target step '${targetStepId}' not found in DAG`,
			};
		}

		// Get all descendants of target step (these need to be re-executed or skipped)
		const descendants = this.dagBuilder.getDescendants(dag, targetStepId);

		// Invalidate target step and all its descendants
		const invalidatedSteps: string[] = [targetStepId];
		const skippedSteps: string[] = [];
		completed.delete(targetStepId);

		for (const descendantId of descendants) {
			if (completed.has(descendantId)) {
				completed.delete(descendantId);

				// Check if this step should be skipped during loops
				const descendantNode = dag.nodes.get(descendantId);
				if (descendantNode?.step.skipOnLoop) {
					skippedSteps.push(descendantId);
					// Mark as completed immediately so it's skipped
					completed.add(descendantId);
				} else {
					invalidatedSteps.push(descendantId);
				}
			}
		}

		// Increment iteration count for the step that triggered the loop
		const currentIteration = (iterations.get(step.id) || 0) + 1;
		iterations.set(step.id, currentIteration);

		// Log loop information
		const maxIterations = step.onFailure?.maxIterations ?? 3;
		console.log(
			`\n [LOOP] Step '${step.id}' failed - returning to '${targetStepId}' (iteration ${currentIteration}/${maxIterations})`
		);
		console.log(`    Invalidated ${invalidatedSteps.length} step(s): ${invalidatedSteps.join(', ')}`);
		if (skippedSteps.length > 0) {
			console.log(`   ⏭  Skipped ${skippedSteps.length} step(s) (skipOnLoop=true): ${skippedSteps.join(', ')}`);
		}

		return {
			success: true,
			invalidatedSteps,
			skippedSteps,
			currentIteration,
		};
	}

	/**
	 * Check if a step has exceeded its iteration limit
	 *
	 * @param stepId - Step ID to check
	 * @param iterations - Current iteration counts
	 * @param maxIterations - Maximum allowed iterations (default: 3)
	 * @returns True if limit is exceeded
	 */
	public isIterationLimitExceeded(
		stepId: string,
		iterations: Map<string, number>,
		maxIterations: number = 3
	): boolean {
		const currentIteration = iterations.get(stepId) || 0;
		return currentIteration >= maxIterations;
	}

	/**
	 * Get formatted loop metadata for logging/debugging
	 *
	 * @param stepId - Step ID
	 * @param iterations - Current iteration counts
	 * @param totalLoops - Total number of loops in flow
	 * @returns Formatted metadata string
	 */
	public getLoopMetadata(stepId: string, iterations: Map<string, number>, totalLoops: number): string {
		const currentIteration = iterations.get(stepId) || 0;
		return `[Loop metadata] Step: ${stepId}, Iteration: ${currentIteration}, Total loops: ${totalLoops}`;
	}

	/**
	 * Reset iteration count for a step (useful for testing or manual control)
	 *
	 * @param stepId - Step ID to reset
	 * @param iterations - Iteration counts map
	 */
	public resetIterations(stepId: string, iterations: Map<string, number>): void {
		iterations.delete(stepId);
	}

	/**
	 * Check if a step should reset iteration counters on success
	 * Resets counters for all steps that have onFailure.goto pointing to this step
	 *
	 * @param completedStepId - Step that just completed successfully
	 * @param allSteps - All steps in the flow
	 * @param iterations - Iteration counts map
	 */
	public handleResetOnSuccess(completedStepId: string, allSteps: FlowStep[], iterations: Map<string, number>): void {
		// Find all steps that have onFailure.goto pointing to the completed step
		// and have resetOnSuccess enabled
		for (const step of allSteps) {
			if (step.onFailure?.goto === completedStepId && step.onFailure?.resetOnSuccess === true) {
				const oldCount = iterations.get(step.id) || 0;
				if (oldCount > 0) {
					iterations.delete(step.id);
					console.log(
						`    Reset iteration counter for '${step.id}' (was ${oldCount}) due to resetOnSuccess`
					);
				}
			}
		}
	}

	/**
	 * Get all steps involved in a potential loop (from target back to current step)
	 *
	 * @param dag - DAG of the flow
	 * @param fromStepId - Step that triggers the loop
	 * @param toStepId - Target step to loop back to
	 * @returns Array of step IDs in the loop path
	 */
	public getLoopPath(dag: DAG, fromStepId: string, toStepId: string): string[] {
		const path: string[] = [];

		// Simple BFS to find path from toStepId to fromStepId
		const queue: Array<{ stepId: string; path: string[] }> = [{ stepId: toStepId, path: [toStepId] }];
		const visited = new Set<string>([toStepId]);

		while (queue.length > 0) {
			const { stepId, path: currentPath } = queue.shift()!;

			if (stepId === fromStepId) {
				return currentPath;
			}

			const node = dag.nodes.get(stepId);
			if (!node) continue;

			for (const dependentId of node.dependents) {
				if (!visited.has(dependentId)) {
					visited.add(dependentId);
					queue.push({
						stepId: dependentId,
						path: [...currentPath, dependentId],
					});
				}
			}
		}

		// No path found (shouldn't happen in valid flows)
		return [];
	}
}
