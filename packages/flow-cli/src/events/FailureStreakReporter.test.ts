import { FailureStreakReporter } from './FailureStreakReporter';

describe('FailureStreakReporter', () => {
	let now: number;
	let lines: string[];
	let reporter: FailureStreakReporter;

	beforeEach(() => {
		now = 0;
		lines = [];
		reporter = new FailureStreakReporter(
			line => lines.push(line),
			() => now,
			60_000
		);
	});

	const failure = (kind: string, message = 'queue is not installed: install queue-cli') => ({
		kind,
		message,
		event: 'flow.step.started',
		outcome: 'dropped' as const,
	});

	it('logs the first failure with the SDK message and the lost event', () => {
		reporter.report(failure('not-installed'));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('install queue-cli');
		expect(lines[0]).toContain('flow.step.started');
	});

	it('logs a streak of the same kind once, and counts the suppressed ones at the next report', () => {
		reporter.report(failure('not-installed'));
		reporter.report(failure('not-installed'));
		reporter.report(failure('not-installed'));
		expect(lines).toHaveLength(1);
		now = 61_000;
		reporter.report(failure('not-installed'));
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain('2 similar');
	});

	it('logs a different kind immediately', () => {
		reporter.report(failure('not-installed'));
		reporter.report(failure('unknown-outcome', 'connection reset'));
		expect(lines).toHaveLength(2);
	});
});
