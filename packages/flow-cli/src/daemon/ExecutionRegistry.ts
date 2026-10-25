import type { FlowScheduler } from 'flow-engine';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';

/** The project an execution belongs to. */
export interface ExecutionProject {
	/** Registry id of the project: what workers attach to and what steps are routed by. */
	projectId: string;
	/** Folder of the project at the time of the run. */
	projectRoot: string;
}

/**
 * In-memory state of every execution the daemon is running.
 *
 * Held here, rather than in each class that needs a piece of it, so that "this execution is over"
 * is one removal: nothing else would ever delete these entries, and a long-lived daemon would keep
 * one per execution it has ever run.
 */
export class ExecutionRegistry {
	/** Per-execution FlowScheduler instances */
	private readonly schedulers = new Map<string, FlowScheduler>();
	/** Per-execution ExecutionContext */
	private readonly contexts = new Map<string, ExecutionContext>();
	/** Per-execution step counts (initial + injected), for the max-steps limit */
	private readonly stepCounts = new Map<string, number>();
	/** Step definitions by execution, consulted on failure to decide resumability. */
	private readonly stepDefinitions = new Map<string, Map<string, AssignableStep>>();
	/**
	 * Project each execution belongs to, for routing (D#9): its registry id (what workers attach to) and its folder.
	 * Every run has one; an execution unknown to this registry has none, which routing treats as "only daemon-created
	 * workers apply" rather than defaulting.
	 */
	private readonly projects = new Map<string, ExecutionProject>();
	/**
	 * Executions kept alive (not cleaned up) after a `user_intervention` step timed out
	 * unanswered, so a later `flow resume` can re-dispatch exactly that step.
	 */
	private readonly resumables = new Map<string, { stepId: string }>();
	private activeCount = 0;

	/** Registers a started execution. */
	start(executionId: string, scheduler: FlowScheduler, context: ExecutionContext, steps: AssignableStep[]): void {
		this.schedulers.set(executionId, scheduler);
		this.contexts.set(executionId, context);
		this.stepDefinitions.set(executionId, new Map(steps.map(s => [s.id, s])));
		this.stepCounts.set(executionId, steps.length);
		this.activeCount++;
	}

	/** Forgets everything held for an execution that is over. */
	remove(executionId: string): void {
		this.schedulers.delete(executionId);
		this.contexts.delete(executionId);
		this.stepDefinitions.delete(executionId);
		this.resumables.delete(executionId);
		this.stepCounts.delete(executionId);
		this.projects.delete(executionId);
		this.activeCount--;
	}

	scheduler(executionId: string): FlowScheduler | undefined {
		return this.schedulers.get(executionId);
	}

	context(executionId: string): ExecutionContext | undefined {
		return this.contexts.get(executionId);
	}

	/** Whether the scheduler still has work for this execution. */
	isActive(executionId: string): boolean {
		return this.schedulers.has(executionId);
	}

	activeExecutionCount(): number {
		return this.activeCount;
	}

	stepType(executionId: string, stepId: string): AssignableStep['type'] | undefined {
		return this.stepDefinitions.get(executionId)?.get(stepId)?.type;
	}

	stepCount(executionId: string): number {
		return this.stepCounts.get(executionId) ?? 0;
	}

	setStepCount(executionId: string, count: number): void {
		this.stepCounts.set(executionId, count);
	}

	/** Returns all known step IDs for an execution (initial + injected so far). */
	knownStepIds(executionId: string): Set<string> {
		return this.schedulers.get(executionId)?.getStepIds() ?? new Set();
	}

	setProject(executionId: string, project: ExecutionProject): void {
		this.projects.set(executionId, project);
	}

	projectOf(executionId: string): ExecutionProject | undefined {
		return this.projects.get(executionId);
	}

	markResumable(executionId: string, stepId: string): void {
		this.resumables.set(executionId, { stepId });
	}

	resumable(executionId: string): { stepId: string } | undefined {
		return this.resumables.get(executionId);
	}

	clearResumable(executionId: string): void {
		this.resumables.delete(executionId);
	}

	resumableCount(): number {
		return this.resumables.size;
	}
}
