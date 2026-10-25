import { describe, expect, it } from 'vitest';

import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import { WorkerFrameTooLargeError, serializeWorkerFrame } from './WorkerFrame';

const ids = { assignmentId: 'a1', executionId: 'e1', stepId: 's1' };

describe('serializeWorkerFrame', () => {
	it('returns the JSON of a frame within the limit', () => {
		const frame = { type: 'step_completed', ...ids, output: { a: 'b' }, meta: {} } as never;

		expect(serializeWorkerFrame(frame)).toBe(JSON.stringify(frame));
	});

	// The daemon's ws server closes the socket on a bigger frame without saying why, so the
	// worker must refuse first and name the size, the limit and what to do.
	it('throws an actionable error for a step_completed frame over the limit', () => {
		const frame = {
			type: 'step_completed',
			...ids,
			output: { big: 'x'.repeat(MAX_WORKER_FRAME_BYTES) },
			meta: {},
		} as never;

		const thrown = (): unknown => {
			try {
				serializeWorkerFrame(frame);
			} catch (err) {
				return err;
			}
			return undefined;
		};
		const err = thrown();

		expect(err).toBeInstanceOf(WorkerFrameTooLargeError);
		expect((err as Error).message).toMatch(/step_completed/);
		expect((err as Error).message).toMatch(String(MAX_WORKER_FRAME_BYTES));
		expect((err as Error).message).toMatch(/reduce|write .* to a file/i);
	});

	it('measures bytes, not characters', () => {
		const frame = {
			type: 'step_completed',
			...ids,
			output: { big: 'é'.repeat(MAX_WORKER_FRAME_BYTES * 0.6) },
			meta: {},
		} as never;

		expect(() => serializeWorkerFrame(frame)).toThrow(WorkerFrameTooLargeError);
	});

	// An oversized failure must still reach the daemon, so the step is failed with the reason
	// instead of the socket being closed.
	it('shrinks an oversized step_failed to its error and says what was dropped', () => {
		const frame = {
			type: 'step_failed',
			...ids,
			error: 'boom',
			stdout: 'x'.repeat(MAX_WORKER_FRAME_BYTES),
		} as never;

		const parsed = JSON.parse(serializeWorkerFrame(frame)) as Record<string, unknown>;

		expect(parsed['type']).toBe('step_failed');
		expect(parsed['stepId']).toBe('s1');
		expect(parsed['stdout']).toBeUndefined();
		expect(parsed['error']).toMatch(/^boom/);
		expect(parsed['error']).toMatch(/dropped/);
	});

	it('throws when even the shrunk step_failed is over the limit', () => {
		const frame = { type: 'step_failed', ...ids, error: 'x'.repeat(MAX_WORKER_FRAME_BYTES) } as never;

		expect(() => serializeWorkerFrame(frame)).toThrow(WorkerFrameTooLargeError);
	});
});
