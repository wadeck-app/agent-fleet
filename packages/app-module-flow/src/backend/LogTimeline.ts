import { type LogRecordStep, attemptOf } from 'flow-core';

// Lines about the run itself (started, step completed, failed...), not about one step: LogWriter.writeExecution.
const RUN_EVENTS_STEP = '__execution';

export interface LogTimelineEntryBase {
	timestamp: string;
	level: string;
	stepId: string;
	message: string;
}

export interface LogTimelineInput<E extends LogTimelineEntryBase> {
	runStartedAt: string;
	/** Null while the run goes on. */
	runCompletedAt: string | null;
	/** Clock (epoch ms): the end of what still runs. */
	now: number;
	recordSteps: LogRecordStep[];
	/** Per step, the timestamps of its `Step <id> started executing` run events. */
	attemptStarts: Record<string, string[]>;
	/** Per step, the number of lines matching the level and text filters. */
	stepLineCounts: Record<string, number>;
	/** The returned page, oldest first. */
	entries: E[];
}

export interface TimelineEntryFields {
	/** 1-based execution order of the step; null for the run events and for a step the record does not know. */
	stepOrder: number | null;
	/** 0 for a root step, 1 for its sub-steps... */
	stepDepth: number;
	/** The step a run event is about ("Step <id> started executing", completed, failed, not run); null for other lines. The order, depth and attempt fields then describe that step. */
	subjectStepId: string | null;
	/** Attempt the line belongs to (0 for run events and for lines before the first start event). */
	attempt: number;
	/** Start events of the step in the log (0 for run events). */
	attempts: number;
	/** Line time minus run start, at least 0. */
	offsetMs: number;
	/** Time since the previous entry of the page; null for the first. */
	deltaMs: number | null;
}

export interface LogStepRow {
	stepId: string;
	/** What to show for the step: the id, or "Run events" for the run's own lines. */
	label: string;
	order: number | null;
	depth: number;
	parentId: string | null;
	/** The recorded status; 'unknown' for a step that logged but is not in the record. */
	status: LogRecordStep['status'] | 'unknown';
	attempts: number;
	lineCount: number;
	startOffsetMs: number | null;
	endOffsetMs: number | null;
	durationMs: number | null;
}

export interface LogTimeline<E extends LogTimelineEntryBase> {
	steps: LogStepRow[];
	runDurationMs: number;
	entries: (E & TimelineEntryFields)[];
}

// Messages of the run events the engine writes about one step (LogWriter.writeExecution).
const SUBJECT_PATTERN = /^Step (\S+) (?:started executing|completed|failed|not run)\b/;

function timeOf(what: string, iso: string): number {
	const time = new Date(iso).getTime();
	if (Number.isNaN(time)) {
		throw new Error(
			`Cannot build the log timeline: ${what} '${iso}' is not a valid date (corrupt execution record or log file?).`
		);
	}
	return time;
}

function depthOf(stepId: string, parents: Map<string, string | null>): number {
	const seen = new Set<string>([stepId]);
	let depth = 0;
	let current = parents.get(stepId) ?? null;
	while (current !== null) {
		if (seen.has(current)) {
			throw new Error(
				`Cannot build the log timeline: the parent chain of step '${stepId}' loops back on '${current}' (corrupt execution record).`
			);
		}
		seen.add(current);
		depth += 1;
		current = parents.get(current) ?? null;
	}
	return depth;
}

interface RecordLayout {
	order: Map<string, number>;
	depth: Map<string, number>;
	parents: Map<string, string | null>;
	/** Record steps in tree and execution order. */
	sorted: LogRecordStep[];
}

function layoutRecord(recordSteps: LogRecordStep[]): RecordLayout {
	const known = new Set(recordSteps.map(step => step.stepId));
	const parents = new Map<string, string | null>();
	for (const step of recordSteps) {
		if (step.parent !== undefined && !known.has(step.parent)) {
			throw new Error(
				`Cannot build the log timeline: step '${step.stepId}' has parent '${step.parent}', which is not a step of the execution record (corrupt record?).`
			);
		}
		parents.set(step.stepId, step.parent ?? null);
	}
	const depth = new Map<string, number>();
	for (const step of recordSteps) {
		depth.set(step.stepId, depthOf(step.stepId, parents));
	}

	// Execution order = start time; ties keep the record order (sort is stable).
	const started = recordSteps
		.filter(step => step.startedAt !== undefined)
		.map(step => ({ step, at: timeOf(`startedAt of step '${step.stepId}'`, step.startedAt!) }))
		.sort((a, b) => a.at - b.at);
	const order = new Map<string, number>();
	started.forEach(({ step }, index) => order.set(step.stepId, index + 1));

	const siblings = (parent: string | null): LogRecordStep[] => {
		const children = recordSteps.filter(step => (step.parent ?? null) === parent);
		const ordered = children
			.filter(step => order.has(step.stepId))
			.sort((a, b) => order.get(a.stepId)! - order.get(b.stepId)!);
		return [...ordered, ...children.filter(step => !order.has(step.stepId))];
	};
	const sorted: LogRecordStep[] = [];
	const visit = (parent: string | null): void => {
		for (const step of siblings(parent)) {
			sorted.push(step);
			visit(step.stepId);
		}
	};
	visit(null);
	return { order, depth, parents, sorted };
}

function recordRow(
	step: LogRecordStep,
	layout: RecordLayout,
	input: LogTimelineInput<LogTimelineEntryBase>,
	runStart: number
): LogStepRow {
	const startOffsetMs =
		step.startedAt === undefined
			? null
			: Math.max(0, timeOf(`startedAt of step '${step.stepId}'`, step.startedAt) - runStart);
	let endOffsetMs: number | null = null;
	if (startOffsetMs !== null) {
		if (step.completedAt !== undefined) {
			endOffsetMs = Math.max(
				startOffsetMs,
				timeOf(`completedAt of step '${step.stepId}'`, step.completedAt) - runStart
			);
		} else if (step.status === 'running') {
			endOffsetMs = Math.max(startOffsetMs, input.now - runStart);
		}
	}
	return {
		stepId: step.stepId,
		label: step.stepId,
		order: layout.order.get(step.stepId) ?? null,
		depth: layout.depth.get(step.stepId)!,
		parentId: step.parent ?? null,
		status: step.status,
		attempts: Math.max(step.attempts ?? 0, input.attemptStarts[step.stepId]?.length ?? 0),
		lineCount: input.stepLineCounts[step.stepId] ?? 0,
		startOffsetMs,
		endOffsetMs,
		durationMs: startOffsetMs !== null && endOffsetMs !== null ? endOffsetMs - startOffsetMs : null,
	};
}

/**
 * Where each log line sits in the run: which step (execution order, depth in the sub-step tree), which attempt, when
 * (offset from the run start, delta from the previous line), plus one row per step for a UI to list them in tree and
 * execution order. Pure: the clock is an input and times stay numbers (the UI formats them).
 * Throws an Error naming the step on a parent that is not a recorded step, a parent cycle or an unreadable timestamp.
 */
export function buildLogTimeline<E extends LogTimelineEntryBase>(input: LogTimelineInput<E>): LogTimeline<E> {
	const runStart = timeOf('the run start', input.runStartedAt);
	const runEnd = input.runCompletedAt === null ? input.now : timeOf('the run end', input.runCompletedAt);
	const layout = layoutRecord(input.recordSteps);
	const recorded = new Set(input.recordSteps.map(step => step.stepId));

	const rows: LogStepRow[] = [];
	const hasRunEvents =
		(input.stepLineCounts[RUN_EVENTS_STEP] ?? 0) > 0 || input.entries.some(e => e.stepId === RUN_EVENTS_STEP);
	if (hasRunEvents) {
		const endOffsetMs = Math.max(0, runEnd - runStart);
		rows.push({
			stepId: RUN_EVENTS_STEP,
			label: 'Run events',
			order: null,
			depth: 0,
			parentId: null,
			status: input.runCompletedAt === null ? 'running' : 'completed',
			attempts: 0,
			lineCount: input.stepLineCounts[RUN_EVENTS_STEP] ?? 0,
			startOffsetMs: 0,
			endOffsetMs,
			durationMs: endOffsetMs,
		});
	}
	for (const step of layout.sorted) {
		rows.push(recordRow(step, layout, input, runStart));
	}
	const unknownIds = new Set([
		...Object.keys(input.stepLineCounts),
		...Object.keys(input.attemptStarts),
		...input.entries.map(e => e.stepId),
	]);
	for (const stepId of [...unknownIds].sort()) {
		if (stepId === RUN_EVENTS_STEP || recorded.has(stepId)) {
			continue;
		}
		rows.push({
			stepId,
			label: stepId,
			order: null,
			depth: 0,
			parentId: null,
			status: 'unknown',
			attempts: input.attemptStarts[stepId]?.length ?? 0,
			lineCount: input.stepLineCounts[stepId] ?? 0,
			startOffsetMs: null,
			endOffsetMs: null,
			durationMs: null,
		});
	}

	let previous: number | null = null;
	const entries = input.entries.map(entry => {
		const at = timeOf(`timestamp of a '${entry.stepId}' log line`, entry.timestamp);
		const isRunEvent = entry.stepId === RUN_EVENTS_STEP;
		const aboutId = isRunEvent ? SUBJECT_PATTERN.exec(entry.message)?.[1] : undefined;
		const subjectStepId = aboutId !== undefined && recorded.has(aboutId) ? aboutId : null;
		// A run event about a step is that step's: its order, depth and attempt.
		const ownerId = subjectStepId ?? entry.stepId;
		const starts = input.attemptStarts[ownerId];
		const noAttempt = isRunEvent && subjectStepId === null;
		const fields: TimelineEntryFields = {
			subjectStepId,
			stepOrder: layout.order.get(ownerId) ?? null,
			stepDepth: layout.depth.get(ownerId) ?? 0,
			attempt: noAttempt ? 0 : attemptOf(starts, entry.timestamp),
			attempts: noAttempt ? 0 : (starts?.length ?? 0),
			offsetMs: Math.max(0, at - runStart),
			deltaMs: previous === null ? null : Math.max(0, at - previous),
		};
		previous = at;
		return { ...entry, ...fields };
	});

	return { steps: rows, runDurationMs: Math.max(0, runEnd - runStart), entries };
}
