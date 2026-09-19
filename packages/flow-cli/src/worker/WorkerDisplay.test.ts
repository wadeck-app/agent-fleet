import { describe, expect, it } from 'vitest';

import { WorkerDisplay } from './WorkerDisplay.js';

function collector() {
	const lines: string[] = [];
	return { lines, write: (line: string) => lines.push(line) };
}

const entry = (message: string, level: 'debug' | 'info' | 'warning' | 'error' = 'info') => ({
	id: 'e1',
	timestamp: 0,
	level,
	message,
	eventType: 'model_output',
});

describe('WorkerDisplay - default verbosity', () => {
	// The step lifecycle is what the person watching the terminal needs: which step is
	// running, and how it ended (D#31).
	it('announces a step starting and finishing', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepStarted('build');
		display.stepCompleted('build', 1_500);

		const joined = out.lines.join('\n');
		expect(joined).toContain('build');
		expect(out.lines.some(line => line.includes('1.5s'))).toBe(true);
	});

	it('shows executionId and step name in the header when provided', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepStarted('build', { executionId: 'abc12345', stepName: 'Build project' });

		const joined = out.lines.join('\n');
		expect(joined).toContain('abc12345');
		expect(joined).toContain('Build project');
	});

	// Raw model output is the worker's by nature, but printing it unasked buries the
	// lifecycle it is meant to illustrate.
	it('does not print raw step output', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepLog('build', entry('thinking about the problem...'));

		expect(out.lines).toEqual([]);
	});

	// A failure is not detail the user opted out of.
	it('always reports a failure with its reason', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepFailed('build', 'exit code 1');

		const joined = out.lines.join('\n');
		expect(joined).toContain('exit code 1');
	});

	it('reports a failure with elapsed time when provided', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepFailed('build', 'exit code 1', 3_200);

		const joined = out.lines.join('\n');
		expect(joined).toContain('exit code 1');
		expect(joined).toContain('3.2s');
	});

	// A warning from a step that still succeeded would otherwise vanish entirely.
	it('prints a warning even when not verbose', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepLog('build', entry('deprecated flag', 'warning'));

		expect(out.lines.join('\n')).toContain('deprecated flag');
	});

	it('separators appear around start and end events', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepStarted('build');
		display.stepCompleted('build', 10);

		// At least two separator lines (opening + closing)
		const separators = out.lines.filter(l => l.includes('──'));
		expect(separators.length).toBeGreaterThanOrEqual(2);
	});
});

describe('WorkerDisplay - verbose', () => {
	it('prints raw step output', () => {
		const out = collector();
		const display = new WorkerDisplay('verbose', out.write);

		display.stepLog('build', entry('thinking about the problem...'));

		expect(out.lines.join('\n')).toContain('thinking about the problem...');
	});

	it('still shows the lifecycle around the output', () => {
		const out = collector();
		const display = new WorkerDisplay('verbose', out.write);

		display.stepStarted('build');
		display.stepLog('build', entry('line one'));
		display.stepCompleted('build', 10);

		// Header: separator + step line + separator (3), log: 1, footer: ok + separator (2) = 6+
		expect(out.lines.length).toBeGreaterThanOrEqual(3);
		// All three events produced at least one line each
		const joined = out.lines.join('\n');
		expect(joined).toContain('build');
		expect(joined).toContain('line one');
	});

	// A worker runs one step at a time (idle/busy), so raw output never interleaves and
	// needs no per-step prefix to stay readable -- but the step is named on entry.
	it('names the step it is printing output for', () => {
		const out = collector();
		const display = new WorkerDisplay('verbose', out.write);

		display.stepLog('build', entry('line one'));

		expect(out.lines[0]).toContain('build');
	});
});

describe('WorkerDisplay - durations', () => {
	it('shows sub-second work in milliseconds', () => {
		const out = collector();
		new WorkerDisplay('summary', out.write).stepCompleted('quick', 42);

		const joined = out.lines.join('\n');
		expect(joined).toContain('42ms');
	});

	it('shows minutes for long work rather than a huge second count', () => {
		const out = collector();
		new WorkerDisplay('summary', out.write).stepCompleted('slow', 3 * 60_000 + 5_000);

		expect(out.lines.join('\n')).toContain('3m5s');
	});
});

describe('WorkerDisplay - timestamps', () => {
	it('all lifecycle lines include a timestamp', () => {
		const out = collector();
		const display = new WorkerDisplay('summary', out.write);

		display.stepStarted('build');
		display.stepCompleted('build', 10);

		// Every non-separator line should have [HH:MM:SS] prefix
		const infoLines = out.lines.filter(l => !l.includes('──'));
		for (const line of infoLines) {
			expect(line).toMatch(/^\[\d{2}:\d{2}:\d{2}\]/);
		}
	});
});
