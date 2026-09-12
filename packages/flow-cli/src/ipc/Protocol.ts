import type { FlowStep, LiveLogEntry, StepMeta } from 'flow-engine/types';

/**
 * Steps the daemon can hand to a worker.
 *
 * `user_intervention` is included because an interactive worker can serve it (D#37);
 * the gate that still rejects it lives in CommandHandler and is lifted in Phase 3.
 * `subflow` stays excluded -- a v1 scope line, not an architectural limit.
 */
export type AssignableStep = Extract<FlowStep, { type: 'model' | 'script' | 'user_intervention' }>;

export interface ExecutionContext {
	executionId: string;
	inputs: Record<string, string>;
	stepOutputs: Record<string, Record<string, unknown>>;
	/** Execution metadata per step (strongly typed per step type) */
	stepMeta: Record<string, StepMeta>;
	workspaceDir: string;
	/** Engine-generated output files directory (<workspaceDir>.meta/outputs) -- never inside workspaceDir */
	outputsDir: string;
	/** Original CWD from which `flow run` was invoked -- used as ${{ context.cwd }} in templates */
	cwd: string;
	/**
	 * Sub-step error history per parent step. Populated by the daemon when a child step fails
	 * and the parent is re-queued. Exposes the last error as ${{ context.lastSubStepError }}
	 * and all accumulated errors as ${{ context.subStepErrors }} in the parent's prompt template.
	 */
	subStepErrors?: Record<string, string[]>;

	/**
	 * Sub-step results for the most recent failed iteration, keyed by child step ID.
	 * Populated by the daemon when a parent is re-queued due to child failure.
	 * Consumed by TemplateRenderer via ${{ subSteps.stepId.outputs.* }} and
	 * ${{ subSteps.stepId.status.failed }}, and {% if subSteps.stepId.status.failed %} blocks.
	 */
	subSteps?: Record<string, { outputs: Record<string, unknown>; status: string }>;

	/** Default working directory from the flow definition (FlowDefinition.workingDir). */
	flowWorkingDir?: string;
}

export type ClientCommand = {
	type: 'run';
	flowFile: string;
	flowId?: string;
	inputs?: Record<string, string>;
	quiet?: boolean;
	cwd: string;
};

export type DaemonResponse =
	{ type: 'execution_started'; executionId: string } | { type: 'error'; message: string; code: string };

/**
 * One live worker, as reported to `flow worker list`.
 *
 * Describes connections only. A declared source with no connection does not appear here,
 * because a live connection is the sole proof of availability (D#4) -- listing intent
 * beside reality would suggest capacity that cannot receive a step.
 */
export interface WorkerSummary {
	workerId: string;
	pid: number;
	state: 'idle' | 'busy';
	sourceId?: string;
	labels: string[];
	attachedProjects: string[];
	hasUserInterface: boolean;
	/** True when this daemon created the worker, so it exits when the daemon idles down. */
	ephemeral: boolean;
}

export type DaemonToWorker =
	| {
			type: 'assign';
			/**
			 * Identifies this specific handout. The worker echoes it on every message about
			 * the step so the daemon can bind the result to work it actually issued (T-05).
			 */
			assignmentId: string;
			stepId: string;
			stepConfig: AssignableStep;
			executionContext: ExecutionContext;
	  }
	// { type: 'idle' } is never sent by the daemon in v1 but is kept for forward compatibility.
	// Worker handles it as a no-op.
	| { type: 'idle' }
	| { type: 'done' };

/**
 * Unvalidated wire format for steps arriving from worker processes via provideSteps.
 * Open-ended ([key: string]: unknown) to accept arbitrary step fields before schema validation.
 * Contrast with AssignableStep, which is the daemon-side typed form after casting.
 */
export interface InjectedStep {
	id: string;
	type: 'model' | 'script' | 'subflow';
	parent?: string;
	depends?: string[];
	[key: string]: unknown;
}

/**
 * A worker announcing itself to the daemon.
 *
 * Every field beyond `pid` is optional so a forked worker, which has none of them,
 * stays valid. They are populated by inbound workers from Phase 2a onward; the daemon
 * applies documented defaults rather than inferring anything.
 */
export interface WorkerReady {
	type: 'ready';
	/**
	 * Process id of the worker. Retained for forked workers, whose connect timeout is
	 * keyed on it. **Not an authentication signal** -- a worker the daemon did not spawn
	 * has no PID the daemon can recognise, which is why `authToken` exists (T-01).
	 */
	pid: number;
	/** Credential presented by the worker. Verified by the S7 implementation (Phase 2a). */
	authToken?: string;
	/** The WorkerSource that produced this worker, for provenance in the audit trail (T-06). */
	sourceId?: string;
	/**
	 * Routing labels, inherited from the source (D#30). **Routing only, never
	 * authorization** (T-07): a label restricts which steps reach a worker, it grants
	 * no privilege and must never be used as an access-control decision.
	 */
	labels?: string[];
	/**
	 * Absolute project roots this worker will serve. Defaults to the single project it
	 * was launched in; serving others is explicit opt-in (D#9).
	 */
	attachedProjects?: string[];
	/**
	 * Whether a human can interact with this worker. The worker alone decides this
	 * (D#33, D#36) -- the daemon cannot observe the far side's TTY. Defaults to false.
	 */
	hasUserInterface?: boolean;
}

export type WorkerToDaemon =
	| WorkerReady
	| { type: 'log'; assignmentId: string; executionId: string; stepId: string; entry: LiveLogEntry }
	/**
	 * Sent the moment the worker begins executing, before any side effect (D#65).
	 *
	 * Its only purpose is to tell the daemon how to treat a disconnect: after this, the
	 * step may have changed something, so it is a failure rather than free work to
	 * re-dispatch. It is reported up front precisely because a dead worker cannot answer
	 * questions later.
	 */
	| { type: 'step_started'; assignmentId: string; executionId: string; stepId: string }
	| {
			type: 'step_completed';
			assignmentId: string;
			executionId: string;
			stepId: string;
			output: Record<string, unknown>;
			meta?: StepMeta;
	  }
	| {
			type: 'step_failed';
			assignmentId: string;
			executionId: string;
			stepId: string;
			error: string;
			output?: Record<string, unknown>;
	  }
	| { type: 'inject_steps'; assignmentId: string; executionId: string; steps: InjectedStep[] };

/**
 * A worker-to-daemon message about the step currently being executed, before its
 * assignment id is attached.
 *
 * The worker binds a sender to one assignment and hands that down to the step
 * execution code, which therefore never sees the id. No call site can forget it or
 * attach the wrong one -- the alternative, passing the id to every log and result
 * call, gets exactly that wrong the first time a new message type is added.
 */
export type AssignmentScopedMessage =
	| Omit<Extract<WorkerToDaemon, { type: 'log' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'step_started' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'step_completed' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'step_failed' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'inject_steps' }>, 'assignmentId'>;

// 're-queued' is reserved for v2 crash recovery. Unreachable in v1 but kept for backward compat.
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 're-queued';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
	/** True when this step was injected dynamically via provideSteps during execution. */
	injected?: boolean;
	/** Error message if the step failed. */
	error?: string;
	/**
	 * Which source supplied the worker that ran this step, and which worker it was
	 * (T-06). Without this, a step's outcome cannot be attributed to the machine that
	 * produced it: once workers arrive from terminals and other hosts, "it ran
	 * somewhere" is not an auditable answer. Absent for steps that never started.
	 */
	sourceId?: string;
	workerId?: string;
}

export interface ExecutionState {
	executionId: string;
	flowFile: string;
	flowId: string;
	status: ExecutionStatus;
	currentSteps: string[];
	startedAt: string;
	completedAt: string | null;
	steps: Record<string, StepState>;
	/** Error message from the last failed step, surfaced to the CLI on flow failure. */
	lastError?: string;
	/**
	 * Project this run belongs to, so the projects with active runs can be listed (D#10).
	 *
	 * The daemon is a per-user machine-wide singleton serving every project at once, so
	 * without recording it per execution there is no way to answer "what is running, and
	 * where" -- the daemon's own cwd says nothing.
	 */
	projectRoot?: string;
}
