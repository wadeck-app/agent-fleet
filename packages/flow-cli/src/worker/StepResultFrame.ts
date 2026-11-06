import type { StepMeta } from 'flow-engine/types';

import type { FrameTruncation, StepIoCapture } from '../ipc/Protocol';
import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';

/** The `step_completed` message a worker builds, before the assignment id is attached. */
export interface StepCompletedReport {
	type: 'step_completed';
	executionId: string;
	stepId: string;
	output: Record<string, unknown>;
	meta?: StepMeta;
	io?: StepIoCapture;
	truncated?: FrameTruncation[];
}

/**
 * A finished step whose result cannot be made to fit in one frame without losing a declared output variable.
 *
 * Carries what the worker forwards with any failure: the attempt's `meta` (the model work was done and has a cost) and
 * `origin: 'engine'`, so the daemon does not retry it -- running the step again produces the same size.
 */
export class StepResultTooLargeError extends Error {
	readonly origin = 'engine' as const;

	constructor(
		message: string,
		readonly meta: StepMeta | undefined
	) {
		super(message);
		this.name = 'StepResultTooLargeError';
	}
}

/** Names of the output variables a step declares (`output:`): the only outputs the worker never cuts. */
export function declaredOutputNames(step: unknown): ReadonlySet<string> {
	const output = (step as { output?: Record<string, unknown> | null }).output;
	return new Set(output === undefined || output === null ? [] : Object.keys(output));
}

/** One line for the worker's own log: what was cut from a step's result and by how much. */
export function describeTruncation(stepId: string, truncated: readonly FrameTruncation[]): string {
	const fields = truncated.map(t => `${t.field} (${String(t.originalBytes)} -> ${String(t.keptBytes)} bytes)`);
	return `step '${stepId}': result over the ${String(MAX_WORKER_FRAME_BYTES)}-byte message limit, cut: ${fields.join(', ')}`;
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, 'utf8');
}

/**
 * Text cut to its last `keepChars` characters, led by a marker saying how much was dropped.
 *
 * The tail is kept: for a stream or a log the end is what explains how it finished. A cut never leaves half a
 * surrogate pair at the start.
 */
export function cutToTail(text: string, keepChars: number): { text: string; keptBytes: number } {
	let tail = text.slice(text.length - keepChars);
	const first = tail.charCodeAt(0);
	if (tail.length > 0 && first >= 0xdc00 && first <= 0xdfff) {
		tail = tail.slice(1);
	}
	const keptBytes = byteLength(tail);
	const marker = `[truncated by the worker: only the last ${String(keptBytes)} of ${String(byteLength(text))} bytes are kept, to fit the ${String(MAX_WORKER_FRAME_BYTES)}-byte message limit]\n`;
	return { text: marker + tail, keptBytes };
}

type Path = readonly string[];

function read(root: unknown, path: Path): unknown {
	let node = root;
	for (const key of path) {
		if (node === null || typeof node !== 'object') {
			return undefined;
		}
		node = (node as Record<string, unknown>)[key];
	}
	return node;
}

// Copies the objects along the path, so the caller's message is never mutated.
function write(root: StepCompletedReport, path: Path, value: string): StepCompletedReport {
	const copy = (node: unknown, rest: Path): unknown => {
		const [key, ...tail] = rest;
		const clone = { ...(node as Record<string, unknown>) };
		clone[key!] = tail.length === 0 ? value : copy(clone[key!], tail);
		return clone;
	};
	return copy(root, path) as StepCompletedReport;
}

/**
 * Diagnostics first (the recorded copy of what the step printed and received), then the implicit outputs
 * (`stdout`, `stderr`, `rawOutput`, `response`) the step did not declare. A model step with `streamJson` puts
 * its whole event stream in `output.stdout`, which is what grows past the limit.
 */
function candidates(message: StepCompletedReport, declared: ReadonlySet<string>): Path[] {
	const inputs = Object.keys(message.io?.inputs ?? {})
		.map((key): Path => ['io', 'inputs', key])
		.sort((a, b) => byteLength(String(read(message, b))) - byteLength(String(read(message, a))));
	const implicit = ['stdout', 'stderr', 'rawOutput', 'response']
		.filter(name => !declared.has(name))
		.map((name): Path => ['output', name]);
	const all: Path[] = [['io', 'stdout'], ['io', 'stderr'], ...inputs, ...implicit];
	return all.filter(path => typeof read(message, path) === 'string');
}

function frameBytes(assignmentId: string, message: StepCompletedReport): number {
	return byteLength(JSON.stringify({ ...message, assignmentId }));
}

function describeOverflow(message: StepCompletedReport, declared: ReadonlySet<string>, size: number): string {
	const sized = Object.entries(message.output)
		.filter(([name]) => declared.has(name))
		.map(([name, value]) => ({ name, bytes: byteLength(JSON.stringify(value) ?? '') }))
		.sort((a, b) => b.bytes - a.bytes);
	const culprit = sized[0];
	const what =
		culprit === undefined
			? `No output variable is declared, so the rest of the result is what does not fit`
			: `Output variable '${culprit.name}' is ${String(culprit.bytes)} bytes`;
	return (
		`Step '${message.stepId}' finished, but its result cannot be sent: it is ${String(size)} bytes even after the diagnostics ` +
		`(captured stdout/stderr, inputs, recorded io) were cut, and the daemon accepts at most ${String(MAX_WORKER_FRAME_BYTES)} bytes per message. ` +
		`${what}. Write large data to a file in the workspace and output its path instead of the content. ` +
		`This failure is not retried: running the step again would produce a result of the same size.`
	);
}

/**
 * Makes a finished step's result fit in one frame without losing it.
 *
 * Cuts, in a fixed order and only as much as needed: the recorded io, then the implicit outputs the step did not
 * declare (see {@link candidates}), each kept as its last part behind a marker. Every cut is listed in `truncated`.
 * Declared output variables are never touched.
 *
 * @param assignmentId Counted in the size: it is added to the frame when it is sent.
 * @returns The message itself, unchanged, when it already fits.
 * @throws StepResultTooLargeError when it still does not fit once everything cuttable is cut.
 */
export function fitStepCompleted(
	assignmentId: string,
	message: StepCompletedReport,
	declared: ReadonlySet<string>
): StepCompletedReport {
	if (frameBytes(assignmentId, message) <= MAX_WORKER_FRAME_BYTES) {
		return message;
	}
	let current = message;
	const truncated: FrameTruncation[] = [];
	const withRecord = (m: StepCompletedReport, extra: FrameTruncation[]): StepCompletedReport => ({
		...m,
		truncated: [...truncated, ...extra],
	});
	for (const path of candidates(message, declared)) {
		const original = read(current, path) as string;
		const originalBytes = byteLength(original);
		const attempt = (keepChars: number): { report: StepCompletedReport; record: FrameTruncation; size: number } => {
			const cut = cutToTail(original, keepChars);
			const record = { field: path.join('.'), originalBytes, keptBytes: cut.keptBytes };
			const report = withRecord(write(current, path, cut.text), [record]);
			return { report, record, size: frameBytes(assignmentId, report) };
		};
		// Cutting a short field to its marker would make the frame bigger, not smaller
		if (attempt(0).size >= frameBytes(assignmentId, withRecord(current, []))) {
			continue;
		}
		// The size only grows with the kept length, so the longest tail that fits is found by bisection
		let low = 0;
		let high = original.length;
		while (low < high) {
			const mid = Math.ceil((low + high) / 2);
			if (attempt(mid).size <= MAX_WORKER_FRAME_BYTES) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}
		const chosen = attempt(low);
		truncated.push(chosen.record);
		current = write(current, path, cutToTail(original, low).text);
		if (chosen.size <= MAX_WORKER_FRAME_BYTES) {
			return chosen.report;
		}
	}
	const size = frameBytes(assignmentId, withRecord(current, []));
	throw new StepResultTooLargeError(describeOverflow(message, declared, size), message.meta);
}
