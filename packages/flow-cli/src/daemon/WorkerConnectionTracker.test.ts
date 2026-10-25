import { describe, expect, it } from 'vitest';

import { WorkerConnectionTracker } from './WorkerConnectionTracker';

const ws = {} as never;
const other = {} as never;

function trackerAt(clock: { now: number }): WorkerConnectionTracker {
	return new WorkerConnectionTracker(() => clock.now);
}

describe('WorkerConnectionTracker', () => {
	it('reports worker id, pid, close code, last message type and how long ago it arrived', () => {
		const clock = { now: 1_000 };
		const tracker = trackerAt(clock);
		tracker.noteMessage(ws, { type: 'ready' });
		tracker.noteMessage(ws, { type: 'step_progress' });
		clock.now = 1_306;

		const report = tracker.describeClose(ws, { code: 1006, reason: '', workerId: 'w-1', pid: 4242 });

		expect(report.logLine).toContain('w-1');
		expect(report.logLine).toContain('4242');
		expect(report.logLine).toContain('1006');
		expect(report.logLine).toContain('step_progress');
		expect(report.logLine).toContain('306 ms ago');
	});

	it('names the age of each started assignment, and ends it when the step reports back', () => {
		const clock = { now: 0 };
		const tracker = trackerAt(clock);
		tracker.noteMessage(ws, { type: 'step_started', executionId: 'e1', stepId: 's1' });
		tracker.noteMessage(ws, { type: 'step_started', executionId: 'e1', stepId: 's2' });
		clock.now = 12_300;
		tracker.noteMessage(ws, { type: 'step_completed', executionId: 'e1', stepId: 's2' });

		const report = tracker.describeClose(ws, { code: 1006, reason: '', workerId: 'w-1', pid: 1 });

		expect(report.noteForStep('e1', 's1')).toContain('12.3 s');
		expect(report.noteForStep('e1', 's2')).toBeUndefined();
		expect(report.logLine).toContain('e1/s1');
	});

	it('explains a missing close frame, since 1006 alone is cryptic', () => {
		const tracker = trackerAt({ now: 0 });

		const report = tracker.describeClose(ws, { code: 1006, reason: '', workerId: 'w-1', pid: 1 });

		expect(report.logLine).toMatch(/no close frame/i);
	});

	it('says so when the worker never sent anything', () => {
		const report = trackerAt({ now: 0 }).describeClose(ws, { code: 1000, reason: '' });

		expect(report.logLine).toMatch(/no message received/i);
		expect(report.logLine).toContain('unregistered');
	});

	it('keeps connections apart', () => {
		const tracker = trackerAt({ now: 0 });
		tracker.noteMessage(ws, { type: 'step_started', executionId: 'e1', stepId: 's1' });

		const report = tracker.describeClose(other, { code: 1000, reason: '' });

		expect(report.noteForStep('e1', 's1')).toBeUndefined();
	});

	it('flags the close as an error only when a started step was lost', () => {
		const tracker = trackerAt({ now: 0 });
		expect(tracker.describeClose(ws, { code: 1006, reason: '' }).lostStartedStep).toBe(false);

		tracker.noteMessage(ws, { type: 'step_started', executionId: 'e1', stepId: 's1' });
		expect(tracker.describeClose(ws, { code: 1006, reason: '' }).lostStartedStep).toBe(true);
	});

	it('points to the daemon log in the per-step note', () => {
		const tracker = trackerAt({ now: 0 });
		tracker.noteMessage(ws, { type: 'step_started', executionId: 'e1', stepId: 's1' });

		const note = tracker
			.describeClose(ws, { code: 1006, reason: '', workerId: 'w-1', pid: 7 })
			.noteForStep('e1', 's1');

		expect(note).toMatch(/daemon log/i);
		expect(note).toContain('w-1');
	});
});
