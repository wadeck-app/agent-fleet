import type { ExecutionState } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { CostReportBuilder } from './CostReportBuilder';
import { CostSince } from './CostSince';
import { CostTextRenderer } from './CostTextRenderer';
import { RunInputReader } from './RunInputReader';

interface StepSpec {
	costUsd?: number;
	/** Cost of an attempt whose price is unknown. */
	unknownAttempt?: boolean;
	estimatedAsOf?: string;
	inputs?: Record<string, { text: string; truncated?: boolean }>;
}

// A step with one attempt log entry: the cost is read by flow-core exactly as for flow show.
function step(spec: StepSpec): Record<string, unknown> {
	const attempts: Record<string, unknown>[] = [];
	const base = {
		origin: 'initial',
		startedAt: '2026-11-01T10:00:00.000Z',
		endedAt: '2026-11-01T10:01:00.000Z',
		durationMs: 60000,
		outcome: 'completed',
		endReason: 'completed',
		// opencode: each attempt costs its own value, so the cost needs no session bookkeeping.
		provider: 'opencode',
		model: 'm',
	};
	if (spec.costUsd !== undefined) {
		attempts.push({
			...base,
			n: 1,
			usd: spec.costUsd,
			...(spec.estimatedAsOf === undefined ? {} : { estimated: true, pricesAsOf: spec.estimatedAsOf }),
		});
	}
	if (spec.unknownAttempt === true) {
		attempts.push({ ...base, n: attempts.length + 1 });
	}
	return {
		status: 'completed',
		attempts: attempts.length,
		attemptLog: attempts,
		...(spec.inputs === undefined
			? {}
			: {
					io: {
						inputs: Object.fromEntries(
							Object.entries(spec.inputs).map(([key, v]) => [
								key,
								{ text: v.text, truncated: v.truncated ?? false, chars: v.text.length },
							])
						),
						outputs: {},
					},
				}),
	};
}

function run(
	id: string,
	flowId: string,
	steps: Record<string, StepSpec>,
	status = 'completed',
	startedAt = '2026-11-01T10:00:00.000Z'
): ExecutionState {
	return {
		executionId: id,
		flowId,
		flowFile: `/tmp/${flowId}.yml`,
		status,
		currentSteps: [],
		startedAt,
		completedAt: startedAt,
		steps: Object.fromEntries(Object.entries(steps).map(([name, spec]) => [name, step(spec)])),
	} as unknown as ExecutionState;
}

describe('CostReportBuilder', () => {
	it('shows what flow-core computes for a run, and nothing for the cost of a run without one', () => {
		const probe = CostReportBuilder.runRow(run('probe', 'f', { a: { costUsd: 1.5 } }));
		// The attempt-log field names are flow-core's: if they drift this guard fails before the real tests mislead.
		expect(probe.totalCostUsd).toBe(1.5);
	});

	describe('by run', () => {
		it('keeps a run with unknown cost with the cost fields ABSENT (not 0, not null)', () => {
			const report = CostReportBuilder.build([run('r1', 'f', { a: {} })], { kind: 'run' }, {});
			const row = (report.rows as unknown as Record<string, unknown>[])[0]!;
			expect(row).toEqual({
				executionId: 'r1',
				flowId: 'f',
				status: 'completed',
				startedAt: '2026-11-01T10:00:00.000Z',
				inputs: {},
			});
			expect('totalCostUsd' in row).toBe(false);
			expect('totalCostComplete' in row).toBe(false);
			expect(report.pricesAsOf).toBeUndefined();
			expect('pricesAsOf' in report).toBe(false);
		});

		it('reports the cost, a lower bound and the oldest prices date of the estimated runs', () => {
			const report = CostReportBuilder.build(
				[
					run('r1', 'f', { a: { costUsd: 2, unknownAttempt: true } }),
					run('r2', 'f', { a: { costUsd: 1, estimatedAsOf: '2026-11-08' } }),
					run('r3', 'f', { a: { costUsd: 1, estimatedAsOf: '2026-10-01' } }),
				],
				{ kind: 'run' },
				{ flow: 'f' }
			);
			expect(report.schema).toBe(1);
			expect(report.by).toBe('run');
			expect(report.filters).toEqual({ flow: 'f' });
			expect(report.pricesAsOf).toBe('2026-10-01');
			const rows = report.rows as {
				totalCostUsd?: number;
				totalCostComplete?: boolean;
				totalCostEstimated?: true;
			}[];
			expect(rows[0]).toMatchObject({ totalCostUsd: 2, totalCostComplete: false });
			expect(rows[1]).toMatchObject({ totalCostUsd: 1, totalCostComplete: true, totalCostEstimated: true });
		});
	});

	describe('by flow', () => {
		const flowRows = (runs: ExecutionState[]) =>
			CostReportBuilder.build(runs, { kind: 'flow' }, {}).rows as {
				flowId: string;
				runs: number;
				completedRuns: number;
				totalUsd?: number;
				medianUsdPerRun?: number;
				maxUsd?: number;
				totalCostComplete: boolean;
			}[];

		it('computes the median of an odd count', () => {
			const [row] = flowRows([
				run('a', 'f', { s: { costUsd: 3 } }),
				run('b', 'f', { s: { costUsd: 1 } }),
				run('c', 'f', { s: { costUsd: 2 } }),
			]);
			expect(row).toMatchObject({ runs: 3, totalUsd: 6, medianUsdPerRun: 2, maxUsd: 3, totalCostComplete: true });
		});

		it('computes the median of an even count as the mean of the two middle runs', () => {
			const [row] = flowRows([
				run('a', 'f', { s: { costUsd: 4 } }),
				run('b', 'f', { s: { costUsd: 1 } }),
				run('c', 'f', { s: { costUsd: 2 } }),
				run('d', 'f', { s: { costUsd: 10 } }),
			]);
			expect(row).toMatchObject({ medianUsdPerRun: 3, maxUsd: 10, totalUsd: 17 });
		});

		it('sums only runs with a figure and flags the group incomplete when one run has an unknown cost', () => {
			const [row] = flowRows([run('a', 'f', { s: { costUsd: 1 } }), run('b', 'f', { s: {} }, 'failed')]);
			expect(row).toMatchObject({
				runs: 2,
				completedRuns: 1,
				totalUsd: 1,
				medianUsdPerRun: 1,
				totalCostComplete: false,
			});
		});

		it('propagates a lower bound to the group', () => {
			const [row] = flowRows([
				run('a', 'f', { s: { costUsd: 1 } }),
				run('b', 'f', { s: { costUsd: 1, unknownAttempt: true } }),
			]);
			expect(row!.totalCostComplete).toBe(false);
			expect(row!.totalUsd).toBe(2);
		});

		it('leaves every *Usd field absent when no run has a cost', () => {
			const [row] = flowRows([run('a', 'f', { s: {} })]);
			expect(row).toEqual({ flowId: 'f', runs: 1, completedRuns: 1, totalCostComplete: false });
		});

		it('does not print float noise in sums', () => {
			const [row] = flowRows([run('a', 'f', { s: { costUsd: 0.1 } }), run('b', 'f', { s: { costUsd: 0.2 } })]);
			expect(row!.totalUsd).toBe(0.3);
		});

		it('makes one row per flow', () => {
			expect(
				flowRows([run('a', 'f1', {}), run('b', 'f2', {}), run('c', 'f1', {})]).map(r => [r.flowId, r.runs])
			).toEqual([
				['f1', 2],
				['f2', 1],
			]);
		});
	});

	describe('by input', () => {
		const withTask = (id: string, task: string | undefined, usd?: number, extra: Partial<StepSpec> = {}) =>
			run(id, 'f', {
				s: {
					...(usd === undefined ? {} : { costUsd: usd }),
					...(task === undefined
						? {}
						: { inputs: { 'inputs.taskId': { text: task }, 'env.X': { text: 'no' } } }),
					...extra,
				},
			});

		it('groups by value, counts the runs without the input and ignores env/secret entries', () => {
			const report = CostReportBuilder.build(
				[withTask('a', '32', 1), withTask('b', '32', 2), withTask('c', '33'), withTask('d', undefined, 5)],
				{ kind: 'input', name: 'taskId' },
				{}
			);
			expect(report.by).toBe('input:taskId');
			expect((report as { withoutInput: number }).withoutInput).toBe(1);
			const rows = report.rows as {
				value: string;
				runs: { executionId: string }[];
				totalUsd?: number;
				totalCostComplete: boolean;
			}[];
			expect(rows.map(r => r.value)).toEqual(['32', '33']);
			expect(rows[0]).toMatchObject({ totalUsd: 3, totalCostComplete: true });
			expect(rows[0]!.runs.map(r => r.executionId)).toEqual(['a', 'b']);
			expect('totalUsd' in rows[1]!).toBe(false);
			expect(rows[1]!.totalCostComplete).toBe(false);
			expect('totalCostUsd' in rows[1]!.runs[0]!).toBe(false);
		});

		it('is empty with every run counted in withoutInput when nobody has the input', () => {
			const report = CostReportBuilder.build([withTask('a', undefined)], { kind: 'input', name: 'taskId' }, {});
			expect(report.rows).toEqual([]);
			expect((report as { withoutInput: number }).withoutInput).toBe(1);
		});
	});

	describe('parseGrouping', () => {
		it('accepts nothing, run, flow and input:<name>', () => {
			expect(CostReportBuilder.parseGrouping(undefined)).toEqual({ kind: 'run' });
			expect(CostReportBuilder.parseGrouping('run')).toEqual({ kind: 'run' });
			expect(CostReportBuilder.parseGrouping('flow')).toEqual({ kind: 'flow' });
			expect(CostReportBuilder.parseGrouping('input:taskId')).toEqual({ kind: 'input', name: 'taskId' });
		});

		it.each(['model', 'input:', 'input'])('refuses "%s" listing the accepted forms', value => {
			expect(() => CostReportBuilder.parseGrouping(value)).toThrow(/Invalid --by .*flow, input:<name>/);
		});
	});
});

describe('RunInputReader', () => {
	it('prefers a complete value over a cut one and keeps the first otherwise', () => {
		const record = run('a', 'f', {
			s1: { inputs: { 'inputs.x': { text: 'cu', truncated: true }, 'inputs.y': { text: 'y1' } } },
			s2: { inputs: { 'inputs.x': { text: 'full' }, 'inputs.y': { text: 'y2' } } },
		});
		expect(RunInputReader.read(record)).toEqual({ x: 'full', y: 'y1' });
	});

	it('is empty for a step without recorded io', () => {
		expect(RunInputReader.read(run('a', 'f', { s: {} }))).toEqual({});
	});
});

describe('CostSince', () => {
	it('parses an ISO date as UTC midnight and a datetime without offset as UTC', () => {
		expect(CostSince.parse('2026-11-01')).toBe(Date.UTC(2026, 10, 1));
		expect(CostSince.parse('2026-11-01T08:30:00')).toBe(Date.UTC(2026, 10, 1, 8, 30));
		expect(CostSince.parse('2026-11-01T08:30:00+02:00')).toBe(Date.UTC(2026, 10, 1, 6, 30));
	});

	it.each(['yesterday', '2026-13-01', '2026-02-31', '11/01/2026', ''])(
		'refuses "%s" naming it with an example',
		value => {
			expect(() => CostSince.parse(value)).toThrow(`Invalid --since "${value}"`);
			expect(() => CostSince.parse(value)).toThrow('--since 2026-11-01');
		}
	);

	it('includes a run started exactly at the bound and refuses an unreadable start time', () => {
		const bound = CostSince.parse('2026-11-01');
		expect(CostSince.includes('2026-11-01T00:00:00.000Z', bound)).toBe(true);
		expect(CostSince.includes('2026-10-31T23:59:59.000Z', bound)).toBe(false);
		expect(CostSince.includes('garbage', bound)).toBe(false);
	});
});

describe('CostTextRenderer', () => {
	const runs = [
		run('r1', 'f', { s: { costUsd: 2, unknownAttempt: true } }),
		run('r2', 'f', { s: { costUsd: 1, estimatedAsOf: '2026-11-08' } }),
		run('r3', 'f', { s: {} }),
	];

	it('prints one line per run: + for a lower bound, ~ for an estimate, unknown for no figure', () => {
		const text = CostTextRenderer.render(CostReportBuilder.build(runs, { kind: 'run' }, {}));
		const lines = text.split('\n');
		expect(lines[0]).toContain('EXECUTION');
		expect(lines.find(l => l.startsWith('r1'))).toContain('$2.0000+');
		expect(lines.find(l => l.startsWith('r2'))).toContain('~$1.0000');
		expect(lines.find(l => l.startsWith('r3'))).toContain('unknown');
		expect(text).toContain('price table of 2026-11-08');
	});

	it('prints the flow and input groupings', () => {
		expect(CostTextRenderer.render(CostReportBuilder.build(runs, { kind: 'flow' }, {}))).toContain('MEDIAN');
		const withInput = [run('a', 'f', { s: { costUsd: 1, inputs: { 'inputs.t': { text: '7' } } } }), runs[2]!];
		const text = CostTextRenderer.render(CostReportBuilder.build(withInput, { kind: 'input', name: 't' }, {}));
		expect(text).toContain('7');
		expect(text).toContain('1 run(s) without this input.');
	});

	it('says so when no run matches', () => {
		expect(CostTextRenderer.render(CostReportBuilder.build([], { kind: 'run' }, {}))).toBe('No executions match.');
	});
});
