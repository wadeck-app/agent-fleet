import * as fs from 'node:fs';
import * as path from 'node:path';

import { logsDirOf } from '../config/FlowConfigLayout.js';
import { InvalidQueryError } from '../errors.js';
import type { StepState } from '../execution/ExecutionState.js';
import { isLogFileName, todayLogDate } from './LogReader.js';

// The daemon's LogWriter appends one NDJSON line per step log entry to the file of the day (UTC):
// {"prefix":"[<executionId>|<stepId>]","timestamp":"<ISO>","level":"info","message":"..."}.
// Daemon-level lines ({ts, level, msg}) carry no execution id and are not read here.

/** Levels LogWriter writes (LiveLogEntry.level). */
export const LOG_LEVELS = ['debug', 'info', 'warning', 'error'] as const;

export interface ExecutionLogTarget {
	executionId: string;
	/** ISO 8601: the first day of the window. */
	startedAt: string;
	/** ISO 8601: the last day of the window; null while the run goes on (the window then ends at the clock). */
	completedAt: string | null;
}

export interface ExecutionLogQuery {
	/** Only this step's lines (`__execution` holds the lines about the run itself). */
	stepId?: string;
	/** Only this level; one of {@link LOG_LEVELS}. */
	level?: string;
	/** Case-insensitive substring of the message. */
	search?: string;
	/** Page size, at least 1. */
	limit: number;
	/** Zero-based page counted from the END of the matching lines: 0 (default) is the tail. */
	page?: number;
}

export interface ExecutionLogEntry {
	/** ISO 8601 as written by the daemon: the host shows it with the shell date format. */
	timestamp: string;
	level: string;
	stepId: string;
	message: string;
}

export interface ExecutionLogs {
	/** The requested page, oldest first. */
	entries: ExecutionLogEntry[];
	/** Lines matching the step, level and text filters, before paging. */
	total: number;
	/** Every step that logged for this execution, sorted: not narrowed by the filters, so a UI can offer them all. */
	stepIds: string[];
	/** Days (`YYYY-MM-DD`) whose log file was read. Empty when the daemon wrote no log in the window (never ran, or rotated away). */
	daysRead: string[];
	/** Lines of those files that mention the execution but could not be parsed, so the list may be incomplete by this many. */
	unreadableLines: number;
	logsDir: string;
}

const PREFIX_RE = /^\[([^|\]]+)\|(.*)\]$/;

function assertInteger(name: string, value: number, min: number): void {
	if (!Number.isInteger(value) || value < min) {
		throw new InvalidQueryError(`Invalid ${name} '${String(value)}': expected an integer >= ${min}.`);
	}
}

function dateOf(name: string, iso: string): string {
	const time = new Date(iso).getTime();
	if (Number.isNaN(time)) {
		throw new InvalidQueryError(`Cannot read the logs of the execution: ${name} '${iso}' is not a valid date.`);
	}
	return todayLogDate(new Date(time));
}

function logDaysIn(logsDir: string, firstDay: string, lastDay: string): string[] {
	let names: string[];
	try {
		names = fs.readdirSync(logsDir);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw err;
	}
	return names
		.filter(isLogFileName)
		.map(name => name.slice(0, 'YYYY-MM-DD'.length))
		.filter(day => day >= firstDay && day <= lastDay)
		.sort();
}

interface ParsedLine {
	stepId: string;
	entry: ExecutionLogEntry;
}

/** The entry of a line written for `executionId`, null for another execution; undefined when the line cannot be read. */
function parseLine(raw: string, executionId: string): ParsedLine | null | undefined {
	// Cheap test before the JSON parse: the daily file holds every execution of the day.
	if (!raw.includes(`[${executionId}|`)) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}
	// violations-suppress: ts/no-unsafe-type-cast parsed JSON has no static shape; the fields are validated below rather than trusted
	const obj = parsed as Record<string, unknown>;
	const prefix = obj['prefix'];
	if (typeof prefix !== 'string') {
		// A daemon line that merely mentions the id.
		return null;
	}
	const match = PREFIX_RE.exec(prefix);
	if (match === null || match[1] !== executionId) {
		return null;
	}
	const { timestamp, message } = obj;
	if (typeof timestamp !== 'string' || typeof message !== 'string') {
		return undefined;
	}
	const stepId = match[2]!;
	return {
		stepId,
		entry: { timestamp, level: typeof obj['level'] === 'string' ? obj['level'] : 'info', stepId, message },
	};
}

/**
 * The log lines of one execution, read from the daemon's daily files between its start and end days.
 * The files are the daemon's own: a day without a file is a normal answer (`daysRead` says what was read), and lines
 * that cannot be parsed are counted, not hidden. Throws InvalidQueryError for a bad level, limit, page or start date.
 *
 * The lines are served as the daemon wrote them. Nothing in the daemon masks secrets before writing (LogMasker is
 * not wired to LogWriter), so callers must not assume the text is safe to expose beyond the local user.
 */
export function readExecutionLogs(
	configDir: string,
	target: ExecutionLogTarget,
	query: ExecutionLogQuery,
	now: Date = new Date()
): ExecutionLogs {
	assertInteger('limit', query.limit, 1);
	const page = query.page ?? 0;
	assertInteger('page', page, 0);
	if (query.level !== undefined && !(LOG_LEVELS as readonly string[]).includes(query.level)) {
		throw new InvalidQueryError(`Invalid level '${query.level}': expected one of ${LOG_LEVELS.join(', ')}.`);
	}

	const firstDay = dateOf('startedAt', target.startedAt);
	const endDay = target.completedAt === null ? todayLogDate(now) : dateOf('completedAt', target.completedAt);
	// A record that ends before it starts (damaged clock) still has its start day to read.
	const lastDay = endDay < firstDay ? firstDay : endDay;
	const logsDir = logsDirOf(configDir);
	const daysRead = logDaysIn(logsDir, firstDay, lastDay);

	const needle = query.search?.toLowerCase();
	const stepIds = new Set<string>();
	const matching: ExecutionLogEntry[] = [];
	let unreadableLines = 0;
	for (const day of daysRead) {
		const content = fs.readFileSync(path.join(logsDir, `${day}.ndjson`), 'utf8');
		for (const raw of content.split('\n')) {
			const parsed = parseLine(raw, target.executionId);
			if (parsed === null) {
				continue;
			}
			if (parsed === undefined) {
				unreadableLines += 1;
				continue;
			}
			stepIds.add(parsed.stepId);
			const { entry } = parsed;
			if (
				(query.stepId === undefined || entry.stepId === query.stepId) &&
				(query.level === undefined || entry.level === query.level) &&
				(needle === undefined || entry.message.toLowerCase().includes(needle))
			) {
				matching.push(entry);
			}
		}
	}

	const end = matching.length - page * query.limit;
	const entries = end <= 0 ? [] : matching.slice(Math.max(0, end - query.limit), end);
	return {
		entries,
		total: matching.length,
		stepIds: [...stepIds].sort(),
		daysRead,
		unreadableLines,
		logsDir,
	};
}

/**
 * What the execution record kept of failed steps (error, stdout, stderr), as text: one block per step, in record order.
 * The record is the only source once the daily logs rotated away. Empty when no (selected) step recorded anything.
 */
export function formatRecordedStepOutput(steps: Record<string, StepState>, stepId?: string): string {
	const blocks: string[] = [];
	for (const [id, step] of Object.entries(steps)) {
		if (stepId !== undefined && id !== stepId) {
			continue;
		}
		const lines: string[] = [];
		if (step.error !== undefined) {
			lines.push(`[${id}] error: ${step.error}`);
		}
		if (step.stdout !== undefined) {
			lines.push(`[${id}] stdout:`, step.stdout);
		}
		if (step.stderr !== undefined) {
			lines.push(`[${id}] stderr:`, step.stderr);
		}
		if (lines.length > 0) {
			blocks.push(`${lines.join('\n')}\n`);
		}
	}
	return blocks.join('\n');
}
