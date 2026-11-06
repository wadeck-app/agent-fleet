import { describe, expect, it } from 'vitest';

import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import type { StepCompletedReport } from './StepResultFrame';
import { StepResultTooLargeError, declaredOutputNames, fitStepCompleted } from './StepResultFrame';

const ASSIGNMENT = 'assignment-1';
const NONE: ReadonlySet<string> = new Set();

function report(output: Record<string, unknown>, extra: Partial<StepCompletedReport> = {}): StepCompletedReport {
	return { type: 'step_completed', executionId: 'e1', stepId: 'implement', output, ...extra };
}

function bytes(message: StepCompletedReport): number {
	return Buffer.byteLength(JSON.stringify({ ...message, assignmentId: ASSIGNMENT }), 'utf8');
}

// A report whose frame is exactly `target` bytes, the padding being ASCII in `output.stdout`.
function reportOfExactly(target: number): StepCompletedReport {
	const empty = bytes(report({ stdout: '' }));
	return report({ stdout: 'x'.repeat(target - empty) });
}

describe('fitStepCompleted -- size boundary', () => {
	it.each([
		['limit - 1', MAX_WORKER_FRAME_BYTES - 1],
		['limit', MAX_WORKER_FRAME_BYTES],
	])('returns the very same message at %s bytes', (_name, target) => {
		const message = reportOfExactly(target);

		expect(bytes(message)).toBe(target);
		expect(fitStepCompleted(ASSIGNMENT, message, NONE)).toBe(message);
	});

	it('cuts at limit + 1 bytes, to a frame within the limit, and lists the cut', () => {
		const message = reportOfExactly(MAX_WORKER_FRAME_BYTES + 1);

		const fitted = fitStepCompleted(ASSIGNMENT, message, NONE);

		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
		expect(fitted.truncated).toHaveLength(1);
		expect(fitted.truncated![0]).toMatchObject({ field: 'output.stdout' });
		expect(fitted.truncated![0]!.originalBytes).toBe(Buffer.byteLength(message.output['stdout'] as string));
		expect(fitted.truncated![0]!.keptBytes).toBeLessThan(fitted.truncated![0]!.originalBytes);
		expect(fitted.output['stdout']).toMatch(/^\[truncated by the worker: only the last \d+ of \d+ bytes are kept/);
	});

	it('keeps as much as fits: one more kept character would not', () => {
		const fitted = fitStepCompleted(ASSIGNMENT, reportOfExactly(MAX_WORKER_FRAME_BYTES * 2), NONE);

		// One kept ASCII character is one byte: the budget is used up to the digits the marker gains
		expect(bytes(fitted)).toBeGreaterThanOrEqual(MAX_WORKER_FRAME_BYTES - 2);
		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
	});

	it('does not modify the message it was given', () => {
		const message = reportOfExactly(MAX_WORKER_FRAME_BYTES + 100);
		const before = JSON.stringify(message);

		fitStepCompleted(ASSIGNMENT, message, NONE);

		expect(JSON.stringify(message)).toBe(before);
	});
});

describe('fitStepCompleted -- bytes, not characters', () => {
	// 'e' with an acute accent is 2 bytes in UTF-8: fewer characters than the limit, more bytes
	it('measures the serialized UTF-8 frame', () => {
		const text = String.fromCharCode(0xe9).repeat(MAX_WORKER_FRAME_BYTES * 0.6);
		const message = report({ stdout: text });
		expect(text.length).toBeLessThan(MAX_WORKER_FRAME_BYTES);

		const fitted = fitStepCompleted(ASSIGNMENT, message, NONE);

		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
		expect(fitted.truncated).toHaveLength(1);
	});

	it('counts JSON escapes: a string of quotes doubles in size', () => {
		const message = report({ stdout: '"'.repeat(MAX_WORKER_FRAME_BYTES * 0.6) });

		const fitted = fitStepCompleted(ASSIGNMENT, message, NONE);

		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
	});

	it('never leaves half a surrogate pair at the cut', () => {
		const emoji = String.fromCodePoint(0x1f600);
		const message = report({ stdout: emoji.repeat(MAX_WORKER_FRAME_BYTES / 4 + 3) });

		const fitted = fitStepCompleted(ASSIGNMENT, message, NONE);

		const kept = (fitted.output['stdout'] as string).split('\n').slice(1).join('\n');
		expect(kept).toBe(emoji.repeat(kept.length / 2));
		expect(kept.length % 2).toBe(0);
		expect(fitted.truncated![0]!.keptBytes).toBe(Buffer.byteLength(kept));
	});
});

describe('fitStepCompleted -- what is cut, in which order', () => {
	const large = 'y'.repeat(MAX_WORKER_FRAME_BYTES + 100);

	it('cuts the recorded io before any output', () => {
		const message = report(
			{ stdout: 'small', answer: 'a' },
			{ io: { inputs: { prompt: 'p' }, stdout: large, stderr: 'e' } }
		);

		const fitted = fitStepCompleted(ASSIGNMENT, message, declaredOutputNames({ output: { answer: {} } }));

		expect(fitted.truncated!.map(t => t.field)).toEqual(['io.stdout']);
		expect(fitted.output).toEqual({ stdout: 'small', answer: 'a' });
	});

	it('cuts the undeclared stdout (the stream-json transcript) and leaves declared outputs and the answer intact', () => {
		const message = report({
			stdout: 'z'.repeat(MAX_WORKER_FRAME_BYTES + 5000),
			rawOutput: 'final answer',
			response: 'final answer',
			plan: 'the plan',
		});

		const fitted = fitStepCompleted(ASSIGNMENT, message, declaredOutputNames({ output: { plan: {} } }));

		expect(fitted.truncated!.map(t => t.field)).toEqual(['output.stdout']);
		expect(fitted.output['plan']).toBe('the plan');
		expect(fitted.output['rawOutput']).toBe('final answer');
		expect(fitted.output['response']).toBe('final answer');
	});

	it('keeps the tail of a cut text, where a stream says how it ended', () => {
		const fitted = fitStepCompleted(
			ASSIGNMENT,
			report({ stdout: 'a'.repeat(MAX_WORKER_FRAME_BYTES) + 'THE-END' }),
			NONE
		);

		expect((fitted.output['stdout'] as string).endsWith('THE-END')).toBe(true);
	});

	it('cuts only as much as needed: the next field is untouched when the first cut is enough', () => {
		const half = 'h'.repeat(MAX_WORKER_FRAME_BYTES * 0.6);

		const fitted = fitStepCompleted(ASSIGNMENT, report({ stdout: half, stderr: half }), NONE);

		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
		expect(fitted.truncated!.map(t => t.field)).toEqual(['output.stdout']);
		expect(fitted.output['stderr']).toBe(half);
	});

	it('goes on to the next field when the first, cut to its marker, is not enough', () => {
		const message = report({
			stdout: 'h'.repeat(MAX_WORKER_FRAME_BYTES * 0.5),
			stderr: 'e'.repeat(MAX_WORKER_FRAME_BYTES + 100),
		});

		const fitted = fitStepCompleted(ASSIGNMENT, message, NONE);

		expect(bytes(fitted)).toBeLessThanOrEqual(MAX_WORKER_FRAME_BYTES);
		expect(fitted.truncated!.map(t => t.field)).toEqual(['output.stdout', 'output.stderr']);
		expect(fitted.truncated![0]!.keptBytes).toBe(0);
	});

	it('never cuts a declared output named like an implicit one', () => {
		const message = report({ stdout: 'declared', stderr: 'q'.repeat(MAX_WORKER_FRAME_BYTES + 10) });

		const fitted = fitStepCompleted(ASSIGNMENT, message, declaredOutputNames({ output: { stdout: {} } }));

		expect(fitted.output['stdout']).toBe('declared');
		expect(fitted.truncated!.map(t => t.field)).toEqual(['output.stderr']);
	});
});

describe('fitStepCompleted -- a declared output that does not fit', () => {
	const meta = { model: 'm', cost: { usd: 1.5 } } as never;

	function overflow(): StepResultTooLargeError {
		const message = report(
			{ stdout: 'small', report: 'r'.repeat(MAX_WORKER_FRAME_BYTES + 10), notes: 'n' },
			{ meta }
		);
		try {
			fitStepCompleted(ASSIGNMENT, message, declaredOutputNames({ output: { report: {}, notes: {} } }));
		} catch (err) {
			return err as StepResultTooLargeError;
		}
		throw new Error('expected fitStepCompleted to throw');
	}

	it('throws an engine-origin error carrying the attempt meta, so it is not retried and keeps its cost', () => {
		const err = overflow();

		expect(err).toBeInstanceOf(StepResultTooLargeError);
		expect(err.origin).toBe('engine');
		expect(err.meta).toBe(meta);
	});

	it('names the step, the output variable, its size, the limit and the fix', () => {
		const err = overflow();

		expect(err.message).toContain(`Step 'implement'`);
		expect(err.message).toContain(`Output variable 'report' is ${String(MAX_WORKER_FRAME_BYTES + 10 + 2)} bytes`);
		expect(err.message).toContain(`at most ${String(MAX_WORKER_FRAME_BYTES)} bytes per message`);
		expect(err.message).toContain('Write large data to a file in the workspace and output its path');
		expect(err.message).toContain('not retried');
	});
});

describe('declaredOutputNames', () => {
	it.each([
		['no output', {}, []],
		['null output', { output: null }, []],
		['two variables', { output: { a: {}, b: {} } }, ['a', 'b']],
	])('%s', (_name, step, expected) => {
		expect([...declaredOutputNames(step)]).toEqual(expected);
	});
});
