import type { ExecutionStatus, StepStatus } from '../execution/ExecutionState.js';
import { formatStarted } from '../history/ExecutionFormat.js';

/**
 * Short, plain ASCII renderings of execution fields for table cells that cannot style or truncate their content
 * (the dsl-ui DataTable ignores a column's width/truncate/muted and wraps anywhere), so a host shortens on the server.
 */

const ELLIPSIS = '...';

// Typed against ExecutionStatus so a status added to ExecutionState fails the build here instead of printing bare.
// @formatter:off
const STATUS_TAGS: Record<ExecutionStatus, string> = {
	queued: 'waiting',
	running: 'running',
	completed: 'ok',
	failed: 'FAILED',
	're-queued': 'retry',
};

const STEP_STATUS_TAGS: Record<StepStatus, string> = {
	pending: 'pending',
	running: 'running',
	completed: 'ok',
	failed: 'FAILED',
};
// @formatter:on

/** "ok", "FAILED"...: one short word that tells the outcome of a run where a table cell is narrow. */
export function statusTag(status: string): string {
	const tag = (STATUS_TAGS as Record<string, string | undefined>)[status];
	if (tag === undefined) {
		throw new Error(
			`No tag for the status '${status}' (known: ${Object.keys(STATUS_TAGS).join(', ')}): add it to STATUS_TAGS in CellText.ts.`
		);
	}
	return tag;
}

/** At most `limit` characters, the last three being "..." when the text was cut. */
export function ellipsize(text: string, limit: number): string {
	if (limit <= ELLIPSIS.length) {
		throw new Error(
			`ellipsize needs a limit above ${ELLIPSIS.length} (one character and the "${ELLIPSIS}"), got ${limit}.`
		);
	}
	return text.length <= limit ? text : `${text.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`;
}

/** An error message as one line of at most `limit` characters; the full text stays in the detail view. */
export function excerptOf(text: string | undefined, limit: number): string {
	if (text === undefined) {
		return '';
	}
	return ellipsize(text.replace(/\s+/g, ' ').trim(), limit);
}

/** "2026-10-18 16:15" (UTC): `flow history` Started column without the seconds. */
export function startedLabel(iso: string): string {
	return formatStarted(iso).slice(0, 16);
}

/** Same short words as `statusTag`, for the status of one step. */
export function stepStatusTag(status: string): string {
	const tag = (STEP_STATUS_TAGS as Record<string, string | undefined>)[status];
	if (tag === undefined) {
		throw new Error(
			`No tag for the step status '${status}' (known: ${Object.keys(STEP_STATUS_TAGS).join(', ')}): add it to STEP_STATUS_TAGS in CellText.ts.`
		);
	}
	return tag;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_RUN_FLOW_LENGTH = 20;
const RUN_ID_LENGTH = 6;

/** "Oct 18 16:15" (UTC): short enough for a narrow column, no ISO noise. */
export function shortStarted(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Cannot shorten the timestamp '${iso}': it is not a valid date (corrupt execution file?).`);
	}
	const pad = (value: number): string => String(value).padStart(2, '0');
	return `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** "build_task rsvl5t": the flow name (at most 20 characters) and the start of the execution id; the full id stays in the row. */
export function runLabel(flowId: string, executionId: string): string {
	return `${ellipsize(flowId, MAX_RUN_FLOW_LENGTH)} ${executionId.slice(0, RUN_ID_LENGTH)}`;
}

export interface OutcomeNotes {
	/** An error was seen but the run (or step) went on to complete. */
	recovered?: boolean;
	attempts?: number;
}

/** A status tag plus what a bare tag would hide: "ok, recovered", "ok, 3 tries". */
export function outcomeLabel(tag: string, notes: OutcomeNotes): string {
	const parts = [tag];
	if (notes.recovered === true) {
		parts.push('recovered');
	}
	if (notes.attempts !== undefined && notes.attempts > 1) {
		parts.push(`${notes.attempts} tries`);
	}
	return parts.join(', ');
}
