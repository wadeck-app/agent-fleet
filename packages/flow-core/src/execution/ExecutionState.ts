import type { AttemptEndReason, StepMeta } from 'flow-engine/types';

// Single source of truth for the persisted execution shape: ExecutionStore (writer, flow-cli)
// and every reader (history, show, app-module) use these types.

// 're-queued' is reserved for v2 crash recovery. Unreachable in v1 but kept for backward compat.
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 're-queued';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

/** One recorded value: the (possibly cut) text and the length of the original, so a cut is never silent. */
export interface RecordedValue {
	text: string;
	/** True when `text` is shorter than the original (cut) or empty because a budget was spent. */
	truncated: boolean;
	/** Length of the original text, after secrets were masked. */
	chars: number;
}

/**
 * What a step attempt received and produced (format note: additive, absent on records written before it existed;
 * readers must treat absence as "not recorded for this run"). Every text was masked with the execution's secrets
 * BEFORE being cut. `inputs` keys: `inputs.NAME` (flow input), `env.NAME`, `secrets.NAME`, `prompt`. A new attempt
 * of the step replaces it. A model step's `stdout` is its final response.
 */
export interface StepIoRecord {
	inputs: Record<string, RecordedValue>;
	outputs: Record<string, RecordedValue>;
	/** Tail of the step's stdout. */
	stdout?: RecordedValue;
	/** Tail of the step's stderr. */
	stderr?: RecordedValue;
	/** True when any value above is cut or emptied. */
	truncated: boolean;
	/** Characters of text stored; counts against the per-execution budget. */
	storedChars: number;
}

/**
 * What started an attempt of a step: its first start, a `retry`, a `loop` (`onFailure.goto` or a sub-step round restart,
 * i.e. any re-run that is not a retry), a `relaunch` of a parent after a failed sub-step, or a `resume` of an unanswered
 * intervention.
 */
export type AttemptOrigin = 'first' | 'retry' | 'loop' | 'relaunch' | 'resume';

/**
 * How an attempt settled: `completed`, `failed` (the step reported a failure), `engine_failed` (the daemon failed it
 * itself: worker lost, stalled, refused), or `abandoned` (the execution ended while it was running).
 */
export type AttemptOutcome = 'completed' | 'failed' | 'engine_failed' | 'abandoned';

/**
 * One settled attempt of a step, written when the attempt ENDS (never at the next start, so the last attempt and a
 * crash are covered). Additive: absent on records written before it existed. Paths of written files are not kept here.
 *
 * Every figure is what the provider REPORTED for that attempt. `usd` absent means unknown (killed before its result,
 * codex, no metrics received), never zero. For claude the reported usd and tokens of a resumed session are
 * CUMULATIVE per session (measured), so these raw values must never be summed: use `summarizeStepCost`.
 */
export interface AttemptRecord {
	/** Attempt number, as in `StepState.attempts` when it started. */
	n: number;
	origin: AttemptOrigin;
	startedAt: string;
	endedAt: string;
	/** `endedAt - startedAt`: includes the time before the worker began. */
	durationMs: number;
	outcome: AttemptOutcome;
	endReason: AttemptEndReason;
	/** Failure message, cut to 500 characters and masked. */
	error?: string;
	model?: string;
	/** Provider that ran the attempt (`claude`, `opencode`, `codex`); absent on entries written before it was recorded. */
	provider?: string;
	/** Provider session id from the attempt's meta; attempts sharing it share a cumulative cost. Absent when none was reported or on older entries. */
	sessionId?: string;
	usd?: number;
	tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	turns?: number;
	/** Total tool calls seen. */
	toolCalls?: number;
	/** True number of distinct files written (paths are only kept in `meta`, for the last attempt). */
	filesWrittenCount?: number;
	/** Position in `StepState.relaunches` of the relaunch that started this attempt. */
	relaunchIndex?: number;
}

/**
 * Totals of the oldest attempts folded out of `attemptLog` once it passes 50 entries for a step or 400 for an execution,
 * so totals stay correct and nothing is dropped silently.
 */
export interface AttemptOverflow {
	count: number;
	/** Sum of the known `usd` of the folded attempts. */
	usd: number;
	/** How many of the folded attempts had no known `usd`. */
	usdUnknownCount: number;
	durationMs: number;
}

export interface StepState {
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
	/** True when this step was injected dynamically via provideSteps during execution. */
	injected?: boolean;
	/** Injected steps only: the steps it was declared to depend on (`depends`), so a chart can draw its edges. */
	dependsOn?: string[];
	/** Injected steps only: the step it was declared a sub-step of (`parent`). */
	parent?: string;
	/** Wave of a direct sub-step of a `waves` parent (`wave:`), recorded at start; absent on other steps and on older records. */
	wave?: number;
	/** Error message if the step failed. */
	error?: string;
	/** Why the step never ran (it is settled as `completed` without an attempt), e.g. a sub-step it depends on failed. */
	skippedReason?: string;
	/** Full stdout captured during the step's execution, when the step failed. */
	stdout?: string;
	/** Full stderr captured during the step's execution, when the step failed. */
	stderr?: string;
	/** Resolved inputs, outputs and stdout/stderr tails of the current attempt; see {@link StepIoRecord}. */
	io?: StepIoRecord;
	/** Execution metadata reported by the worker on step_completed (cost/tokens/duration). */
	meta?: StepMeta;
	/** Number of times the step was started (retries, onFailure loops, resumes); absent on records written before this existed. */
	attempts?: number;
	/** Wall-clock time spent in attempts before the current one, so retries stay visible in `flow show`. */
	priorAttemptsMs?: number;
	/** One entry per relaunch of this step caused by a failed sub-step, with the feedback it was resumed with (truncated). */
	relaunches?: { at: string; feedback: string }[];
	/**
	 * One entry per settled attempt, oldest first (see {@link AttemptRecord}); `meta` stays "the last attempt". Absent on
	 * records written before it existed: readers fall back to `meta` and `attempts`.
	 */
	attemptLog?: AttemptRecord[];
	/** Totals of the attempts folded out of `attemptLog` by its size caps. */
	attemptOverflow?: AttemptOverflow;
	/** How the attempt now running started; moved into its `attemptLog` entry when it settles. */
	runningAttempt?: { origin: AttemptOrigin; relaunchIndex?: number };
	/**
	 * Which source supplied the worker that ran this step, and which worker it was
	 * (T-06). Without this, a step's outcome cannot be attributed to the machine that
	 * produced it. Absent for steps that never started.
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
	/**
	 * Registry id (project-sdk) of the project this run belongs to, written next to `projectRoot`. Additive: absent on
	 * records written before project ids existed, which stay readable (they only have `projectRoot`).
	 */
	projectId?: string;
	/**
	 * Which definition ran (format note: additive, absent on records written before flow versions existed;
	 * readers must treat absence as "version not recorded"). The four fields below are written together, once, when
	 * the run starts, and never change afterwards (a `flow resume` keeps them).
	 * Semantic version of the definition; `0.0.0` when the flow declared none.
	 */
	flowVersion?: string;
	/** Full sha256 of the canonical definition: two runs with the same hash ran identical content. */
	definitionHash?: string;
	/** Immutable copy of the definition that ran: `<flowId>/<version>-<hash12>.yml` under the definitions directory. */
	definitionSnapshot?: string;
	/** How the version was chosen: `latest` known at run start, `pinned` by `flow run <id>@<version>`, or `file` (run by path, as is). */
	versionChoice?: VersionChoice;
}

export type VersionChoice = 'latest' | 'pinned' | 'file';
