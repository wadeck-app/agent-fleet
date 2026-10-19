import type { ExecutionStatus } from '../execution/ExecutionState.js';
import { formatStarted } from '../history/ExecutionFormat.js';

/**
 * Short, plain ASCII renderings of execution fields for table cells that cannot style or truncate their content
 * (the dsl-ui DataTable ignores a column's width/truncate/muted and wraps anywhere), so a host shortens on the server.
 */

const ELLIPSIS = '...';

// Typed against ExecutionStatus so a status added to ExecutionState fails the build here instead of printing bare.
// @formatter:off
const STATUS_TAGS: Record<ExecutionStatus, string> = {
	queued: 'wait',
	running: 'run',
	completed: 'ok',
	failed: 'FAIL',
	're-queued': 'retry',
};
// @formatter:on

/** "ok", "FAIL"...: a few characters that tell the outcome of a run where the full word does not fit. */
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
