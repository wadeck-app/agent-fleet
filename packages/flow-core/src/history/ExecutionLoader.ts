import * as fs from 'node:fs';
import * as path from 'node:path';

import { errorMessage } from '../errors.js';
import type { ExecutionState } from '../execution/ExecutionState.js';

/** An execution file that could not be used, with the reason a user can act on. */
export interface SkippedExecutionFile {
	file: string;
	reason: string;
}

export interface ExecutionReport {
	/** Valid records, newest first. */
	executions: ExecutionState[];
	skipped: SkippedExecutionFile[];
}

/**
 * Loads every execution record of `executionsDir`, newest first, and reports the files it could not use
 * (unreadable, not JSON, no executionId, no steps object) instead of hiding them.
 * A missing directory is an empty history.
 */
export function loadExecutionReport(executionsDir: string): ExecutionReport {
	if (!fs.existsSync(executionsDir)) return { executions: [], skipped: [] };
	const executions: ExecutionState[] = [];
	const skipped: SkippedExecutionFile[] = [];
	for (const name of fs.readdirSync(executionsDir)) {
		if (!name.endsWith('.json')) continue;
		const file = path.join(executionsDir, name);
		let raw: string;
		try {
			raw = fs.readFileSync(file, 'utf8');
		} catch (err) {
			skipped.push({ file, reason: `unreadable: ${errorMessage(err)}` });
			continue;
		}
		let rec: ExecutionState;
		try {
			rec = JSON.parse(raw) as ExecutionState;
		} catch (err) {
			skipped.push({ file, reason: `not valid JSON: ${errorMessage(err)}` });
			continue;
		}
		if (!rec || !rec.executionId) {
			skipped.push({ file, reason: "missing 'executionId'" });
			continue;
		}
		// Readers iterate `steps` unconditionally: a record without it would turn one damaged file into a failure of the whole listing.
		if (typeof rec.steps !== 'object' || rec.steps === null) {
			skipped.push({ file, reason: "missing 'steps' object" });
			continue;
		}
		executions.push(rec);
	}
	executions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
	return { executions, skipped };
}

/** The valid records only; use {@link loadExecutionReport} when the caller can tell the user about skipped files. */
export function loadExecutions(executionsDir: string): ExecutionState[] {
	return loadExecutionReport(executionsDir).executions;
}

/** One-line, actionable warning for skipped files; undefined when there is nothing to warn about. */
export function describeSkippedExecutions(skipped: readonly SkippedExecutionFile[]): string | undefined {
	const [first, ...rest] = skipped;
	if (!first) return undefined;
	if (rest.length === 0) return `1 execution file skipped: ${first.file} (${first.reason}). Fix or delete it.`;
	return `${skipped.length} execution files skipped; first: ${first.file} (${first.reason}), and ${rest.length} more. Fix or delete them.`;
}
