import type { StepMeta } from 'flow-engine/types';

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
