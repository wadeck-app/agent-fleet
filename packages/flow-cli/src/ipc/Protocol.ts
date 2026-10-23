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

	/**
	 * Every failed sub-step's own feedback (stderr/rawOutput/stdout), pre-aggregated into one
	 * string. Consumed by TemplateRenderer via ${{ subStepFeedback }} -- a flow author adding a
	 * sub-step to a retry chain does not also have to wire its feedback into the prompt by hand.
	 */
	subStepFeedback?: string;

	/**
	 * Present only on the assignment of a parent step re-queued because a sub-step failed. The
	 * worker resumes the parent's previous session (`stepMeta[stepId].session_id`) and sends only
	 * `feedback` -- the failed sub-steps' aggregated feedback -- instead of rendering the step's
	 * prompt again. Set per assignment by the daemon, never on the shared execution context.
	 * A worker that predates it ignores the field and re-renders the prompt (see
	 * `WORKER_FEATURE_SUB_STEP_SESSION_RESUME`); the daemon warns when it dispatches to one.
	 */
	subStepRelaunch?: { feedback: string };

	/**
	 * Values of the secrets THIS step uses (declared with `secrets:` or referenced as
	 * `${{ inputs.NAME }}`), by input name. Set per assignment by the daemon, never on the shared
	 * execution context, and absent for every other step. The worker must mask these exact values
	 * in everything it sends back or prints (see `WORKER_FEATURE_SECRETS`); a worker that predates
	 * the field is never given a step that needs it.
	 */
	secrets?: Record<string, string>;

	/** Default working directory from the flow definition (FlowDefinition.workingDir). */
	flowWorkingDir?: string;

	/** Flow definition's own id/version (FlowDefinition.id/.version) -- printed once per
	 * execution in the worker's own log, next to its connection-state messages, so a diagnosis
	 * started from worker output alone always knows which flow version actually ran. */
	flowId?: string;
	flowVersion?: string;
}

/**
 * `WorkerReady.features` value: the worker honours `ExecutionContext.subStepRelaunch` (resumes the
 * parent's session with just the sub-step feedback). A worker not declaring it re-renders the
 * parent's whole prompt, so the daemon names that in the execution log instead of staying silent.
 */
export const WORKER_FEATURE_SUB_STEP_SESSION_RESUME = 'sub-step-session-resume';

/**
 * The worker receives `ExecutionContext.secrets`, injects them into the step and masks their exact
 * values in what it reports. The daemon fails a step that needs secrets rather than dispatch it to
 * a worker not declaring this: that worker would run the step with the variable missing.
 */
export const WORKER_FEATURE_SECRETS = 'secrets';

export type ClientCommand =
	| {
			type: 'run';
			flowFile: string;
			flowId?: string;
			inputs?: Record<string, string>;
			quiet?: boolean;
			cwd: string;
			/**
			 * `--mock-config` overlay: per-step env vars merged into that step's `env` with the
			 * highest priority, so a mock-CLI convention (`*_MOCK_PATH`/`*_MOCK_RESPONSE`/
			 * `*_MOCK_EXIT_CODE`) can replace a step's real execution without touching the flow file.
			 * Keyed by step id.
			 */
			mockEnv?: Record<string, Record<string, string>>;
			/** Absolute path to the `--mock-config` file, surfaced in the "MOCK" warning banner. */
			mockConfigPath?: string;
	  }
	| {
			type: 'resume';
			executionId: string;
	  };

export type DaemonResponse =
	| { type: 'execution_started'; executionId: string }
	| { type: 'execution_resumed'; executionId: string; stepId: string }
	| { type: 'error'; message: string; code: string };

/**
 * Payload for the `updateWorker` admin command (`flow worker update`).
 *
 * Sent over the daemon's command channel (`@wadeck-app/singleton-daemon-kit`'s
 * `createDaemonClient`/`createDaemon`), the same one `flow worker list` already uses for
 * `workers` -- not over the worker WebSocket protocol below. It mutates the daemon's own
 * `WorkerRegistry` entry only (Proposal 3): `StepRouter` reads straight from that registry,
 * so no restart, and no message to the worker process itself, is needed for dispatch to see
 * the change. `labels`/`shellCapabilities`, when given, replace the current list.
 */
export interface UpdateWorkerRequest {
	workerId: string;
	labels?: string[];
	shellCapabilities?: string[];
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
 * A relay that supplies workers, connected to the daemon (D#17, D#19).
 *
 * Inbound only: the relay dials the daemon, so the daemon never holds credentials for
 * logging into it and there is no credential store to compromise (D#18).
 */
export interface SourceReady {
	type: 'source_ready';
	/** The declared source this relay is claiming to be. */
	sourceId: string;
	/**
	 * Credential for registering *as a source*, which is not a worker credential (T-04,
	 * T-11): a fake source manufactures capacity wholesale rather than absorbing one step.
	 */
	sourceToken: string;
	/** How many workers this relay is willing to run. The daemon never exceeds it (D#19). */
	capacity: number;
}

/**
 * What the daemon may say to a relay.
 *
 * Nothing here is executable, and nothing names a command, a path, or a script: the daemon
 * asks for a worker, and *how* one comes into being is the relay's business, decided from
 * recipes it holds locally (D#19, D#20). That is what stops a compromised daemon from
 * owning every connected relay (T-13).
 */
export type DaemonToSource = {
	type: 'provide_worker';
	/** Correlates the relay's answer with this request. */
	requestId: string;
	/** Projects the worker would serve, so the relay can decline what it cannot reach (D#9). */
	projects: string[];
	/** Labels the resulting worker is expected to carry (D#30). */
	labels: string[];
};

/** What a relay may say back. */
export type SourceToDaemon =
	| SourceReady
	| {
			type: 'provide_worker_ack';
			requestId: string;
			/**
			 * Whether the relay will try to produce a worker.
			 *
			 * Accepting is **not** a promise that one appears: only a live connection proves a
			 * worker exists (D#4). Declining is normal -- at capacity, or unable to serve the
			 * projects asked for -- and carries a reason so it is not silent.
			 */
			accepted: boolean;
			reason?: string;
	  };

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
	/** flow-cli version this worker process is running, as reported by its own `VERSION` constant. */
	version?: string;
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
	/**
	 * Shells this worker can actually run (`bash`/`cmd`/`pwsh`), probed once at launch via
	 * each shell's own `ShellStrategy.resolve()` (see WorkerLaunch.probeShellCapabilities).
	 * Populated by inbound workers; the daemon applies the same "claims nothing until it
	 * says otherwise" default as `labels` -- absent or omitted means no declared capability.
	 */
	shellCapabilities?: ('bash' | 'cmd' | 'pwsh')[];
	/**
	 * Protocol features this worker implements (see `WORKER_FEATURE_*`). Absent from a worker
	 * built before the feature existed, which the daemon treats as "supports none" and names in
	 * the log where it matters, rather than assuming.
	 */
	features?: string[];
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
	/**
	 * A heartbeat for the daemon's stall watchdog, independent of `log`/`toolLog` display settings.
	 *
	 * `log: 'end'` (the default) never forwards a `log` message mid-execution, and `toolLog: 'none'`
	 * (the default) strips tool activity even from `log: 'streaming'` -- so a healthy, narration-free,
	 * tool-call-only step could go fully silent and get killed as stuck even though the provider was
	 * actively working the whole time. This message carries no content to display; it only resets
	 * the silence clock.
	 */
	| { type: 'step_progress'; assignmentId: string; executionId: string; stepId: string }
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
			stdout?: string;
			stderr?: string;
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
	| Omit<Extract<WorkerToDaemon, { type: 'step_progress' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'step_completed' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'step_failed' }>, 'assignmentId'>
	| Omit<Extract<WorkerToDaemon, { type: 'inject_steps' }>, 'assignmentId'>;

// Persisted-execution and worker-listing shapes live in flow-core, the single source of truth shared with
// every reader of them; re-exported here so the daemon keeps importing them from its own protocol.
export type { ExecutionState, ExecutionStatus, StepState, StepStatus, WorkerSummary } from 'flow-core';
