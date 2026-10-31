import type { RunEndReason } from 'extension-points';
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

/**
 * The worker attaches to projects by registry id (`WorkerReady.attachedProjectIds`). A worker that does not declare
 * this one attached itself by folder paths, which the daemon can no longer match: it is refused at registration with a
 * message telling the user to update the worker, instead of being connected and never receiving a step.
 */
export const WORKER_FEATURE_PROJECT_ID = 'project-id';

/**
 * The worker understands `run_end` and answers it with `run_end_ack`. Declared only by workers that need to know when a run
 * ended (a sandbox bridge, to remove the sandbox of a run): it is deliberately NOT part of the features every worker
 * declares, so a worker that does not declare it is never sent `run_end` and the wire does not change for it.
 */
export const WORKER_FEATURE_RUN_EVENTS = 'run-events';

export type ClientCommand =
	| {
			type: 'run';
			flowFile: string;
			flowId?: string;
			/**
			 * One id per `flow run` invocation, identical on every attempt to deliver it. The daemon answers a repeated id
			 * with the answer of the first one instead of starting a second execution. Optional: an older CLI sends none.
			 */
			requestId?: string;
			/**
			 * `flow run <id>@<version>`: run exactly this version of the registered flow `flowId`. Absent = the
			 * latest known version at the time of the run. Refused together with a flow file (`registered` absent).
			 */
			flowVersion?: string;
			/**
			 * True when `flowFile` is a flow registry (`.flow/flows.yml`) and `flowId` names the flow to run;
			 * absent when `flowFile` is the flow itself.
			 */
			registered?: boolean;
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
			/**
			 * `-p/--project <ref>` as the user typed it (name, alias or id). The daemon serves every project, so it
			 * resolves the project itself, per request, from what the client sends: this, `envProject`, then `cwd`.
			 */
			projectRef?: string;
			/** The client's `FLOW_PROJECT` (the daemon's own environment is never consulted for it). */
			envProject?: string;
			/**
			 * The project registry directory the client resolved against. The daemon refuses the run when its own differs
			 * (an `XDG_CONFIG_HOME` set in one shell only), rather than answering from another registry.
			 */
			registryDir?: string;
	  }
	| {
			type: 'resume';
			executionId: string;
	  }
	| {
			type: 'cancel';
			executionId: string;
			/**
			 * Registry id of the project the user scoped the command to (`-p/--project` or `FLOW_PROJECT`). When given, the
			 * daemon refuses an execution of another project instead of cancelling it.
			 */
			projectId?: string;
	  };

/**
 * `code` of the refusal a daemon gives to a command that reaches it after it decided to stop. Nothing was accepted: the
 * client treats it as "not running", waits for that daemon to be gone and starts another one.
 */
export const DAEMON_STOPPING_CODE = 'DAEMON_STOPPING';

export type DaemonResponse =
	| { type: 'execution_started'; executionId: string }
	| { type: 'execution_resumed'; executionId: string; stepId: string }
	/** `alreadyCancelled`: the execution had been cancelled before this command, nothing was changed. */
	| { type: 'execution_cancelled'; executionId: string; alreadyCancelled: boolean }
	/** `detail` refines `code` when one code covers several causes (PROJECT_RESOLUTION_FAILED: NO_PROJECT_IN_SCOPE, PROJECT_NOT_FOUND, ...). */
	| { type: 'error'; message: string; code: string; detail?: string };

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
	| { type: 'done' }
	/**
	 * A run this worker served has ended; sent only to workers that declared {@link WORKER_FEATURE_RUN_EVENTS} AND ran a
	 * step of that run, once per run. The worker answers `run_end_ack` once it no longer needs anything of the run.
	 *
	 * In-flight steps may still report after `run_end`; their results are dropped.
	 */
	| { type: 'run_end'; executionId: string; reason: RunEndReason };

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
/**
 * What a step received and what it printed, reported by the worker with the step's outcome so the daemon can
 * record it (`StepState.io`). Already masked by the worker; the daemon masks and caps again before storing.
 * `inputs` keys: `inputs.NAME`, `env.NAME`, `secrets.NAME` (placeholder only), `prompt`. A model step's
 * `stdout` is its final response.
 */
export interface StepIoCapture {
	inputs: Record<string, string>;
	stdout?: string;
	stderr?: string;
}

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
	 * Registry ids of the projects this worker serves: what the daemon routes steps by. Defaults to the project it was
	 * launched in; serving others is explicit opt-in (D#9). Declared together with {@link WORKER_FEATURE_PROJECT_ID}.
	 */
	attachedProjectIds?: string[];
	/** Folders of those projects as the worker saw them, for display (`flow worker list`); never used for routing. */
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

/** A tool call a worker saw start and has not seen return. */
export interface StepToolActivity {
	tool: string;
	/** Main argument of the call, masked and at most {@link TOOL_ACTIVITY_SUMMARY_MAX_LENGTH} characters. */
	summary: string;
	/** Epoch milliseconds, on the worker's clock, at which the call was seen to start. */
	startedAt: number;
}

/** Longest `StepToolActivity.summary` a worker sends. */
export const TOOL_ACTIVITY_SUMMARY_MAX_LENGTH = 120;

/**
 * What a `step_progress` says about the tool call in flight. Every field is optional because most
 * progress messages are plain heartbeats.
 */
export interface StepProgressDetail {
	/**
	 * `undefined` = this message says nothing about it (the daemon keeps what it knew);
	 * an object = that call is running; `null` = no call is running any more.
	 */
	activity?: StepToolActivity | null;
	/** Name of the last tool call seen to return. Only ever a name, never its arguments. */
	lastCompletedTool?: string;
	/**
	 * Epoch milliseconds (worker clock) at which the model produced its final `result`.
	 * `undefined` = says nothing about it; a number = the final result was seen; `null` = a follow-up
	 * turn started since, so there is no final result to speak of. Lets a stall report say the process
	 * outlived a finished turn instead of blaming the last tool call.
	 */
	finalResultAt?: number | null;
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
	 * the silence clock -- and, when the provider lets it be known, which tool call the step is
	 * waiting on, so that a stall can say what it was stuck in (see {@link StepProgressDetail}).
	 */
	| ({ type: 'step_progress'; assignmentId: string; executionId: string; stepId: string } & StepProgressDetail)
	| {
			type: 'step_completed';
			assignmentId: string;
			executionId: string;
			stepId: string;
			output: Record<string, unknown>;
			meta?: StepMeta;
			/** Absent from a worker older than step recording: the daemon then records the outputs only. */
			io?: StepIoCapture;
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
			io?: StepIoCapture;
			/**
			 * What the failed attempt cost and did (duration, cost, turns, end reason). Absent from a worker older than
			 * failed-attempt metrics, and from a step refused before anything ran: the daemon then records the attempt
			 * without metrics, never with a zero cost.
			 */
			meta?: StepMeta;
	  }
	| { type: 'inject_steps'; assignmentId: string; executionId: string; steps: InjectedStep[] }
	/** Answer to `run_end`: the worker is done with the run. Not bound to an assignment: it concerns the whole run. */
	| { type: 'run_end_ack'; executionId: string };

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
