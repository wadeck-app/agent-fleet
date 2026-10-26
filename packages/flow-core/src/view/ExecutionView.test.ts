import { describe, expect, it } from 'vitest';

import type { ExecutionState } from '../execution/ExecutionState.js';
import { toExecutionDetail, toExecutionSummary } from './ExecutionView.js';

function record(partial: Partial<ExecutionState> = {}): ExecutionState {
	return {
		executionId: 'abc123',
		flowId: 'deploy',
		flowFile: '/flows/deploy.yml',
		status: 'completed',
		currentSteps: [],
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:01:05.000Z',
		steps: {
			build: {
				status: 'completed',
				startedAt: '2026-08-16T12:00:00.000Z',
				completedAt: '2026-08-16T12:00:10.000Z',
			},
			test: {
				status: 'failed',
				startedAt: '2026-08-16T12:00:10.000Z',
				completedAt: '2026-08-16T12:00:12.000Z',
				error: 'exit 1',
			},
		},
		...partial,
	};
}

describe('toExecutionSummary', () => {
	it('keeps what a table row needs and counts steps, without the steps themselves', () => {
		const summary = toExecutionSummary(record({ lastError: 'exit 1', projectRoot: '/work/app' }));
		expect(summary).toEqual({
			executionId: 'abc123',
			flowId: 'deploy',
			flowFile: '/flows/deploy.yml',
			status: 'completed',
			startedAt: '2026-08-16T12:00:00.000Z',
			completedAt: '2026-08-16T12:01:05.000Z',
			duration: '1m5s',
			lastError: 'exit 1',
			// completed run: lastError is a recovered retry, not the outcome
			lastErrorRecovered: true,
			projectRoot: '/work/app',
			// a record with only projectRoot is labelled "<root> (-)"
			projectLabel: '/work/app (-)',
			stepCount: 2,
			failedStepCount: 1,
			versionLabel: '-',
		});
	});

	it('exposes the recorded version, and a dash for a record written before versions existed', () => {
		const versioned = toExecutionSummary(
			record({
				flowVersion: '1.4.0',
				definitionHash: 'c'.repeat(64),
				definitionSnapshot: 'deploy/1.4.0-cccccccccccc.yml',
				versionChoice: 'latest',
			})
		);
		expect(versioned).toMatchObject({ flowVersion: '1.4.0', versionLabel: '1.4.0' });
		const legacy = toExecutionSummary(record());
		expect(legacy).not.toHaveProperty('flowVersion');
		expect(legacy.versionLabel).toBe('-');
	});

	it('reports a running execution as running and a failed one with its error as not recovered', () => {
		expect(toExecutionSummary(record({ status: 'running', completedAt: null })).duration).toBe('running');
		const failed = toExecutionSummary(record({ status: 'failed', lastError: 'boom' }));
		expect(failed.lastErrorRecovered).toBe(false);
	});

	it('omits optional fields rather than sending undefined', () => {
		const summary = toExecutionSummary(record());
		expect(summary).not.toHaveProperty('lastError');
		expect(summary).not.toHaveProperty('projectRoot');
		expect(summary.lastErrorRecovered).toBe(false);
	});
});

describe('toExecutionDetail', () => {
	const resolved = { record: record(), filePath: '/cfg/executions/abc123.json' };

	it('describes how the version was chosen, or says it was not recorded', () => {
		expect(toExecutionDetail(resolved, 'T').versionNote).toBe('run started before flow versions existed');
		const versioned = {
			...resolved,
			record: record({
				flowVersion: '1.4.0',
				definitionHash: 'c'.repeat(64),
				definitionSnapshot: 'deploy/1.4.0-cccccccccccc.yml',
				versionChoice: 'pinned',
			}),
		};
		expect(toExecutionDetail(versioned, 'T').versionNote).toBe('pinned by the request, definition cccccccccccc');
	});

	it('lists steps in order with a duration, and the rendered text', () => {
		const detail = toExecutionDetail(resolved, 'RENDERED');
		expect(detail.text).toBe('RENDERED');
		expect(detail.filePath).toBe('/cfg/executions/abc123.json');
		expect(detail.steps.map(s => [s.stepId, s.status, s.duration])).toEqual([
			['build', 'completed', '10.0s'],
			['test', 'failed', '2.0s'],
		]);
		expect(detail.steps[1]!.error).toBe('exit 1');
	});

	it('exposes model, attempts, relaunches, injection and worker attribution when recorded', () => {
		const detail = toExecutionDetail(
			{
				filePath: 'f',
				record: record({
					steps: {
						ask: {
							status: 'completed',
							startedAt: '2026-08-16T12:00:00.000Z',
							completedAt: '2026-08-16T12:00:01.000Z',
							injected: true,
							attempts: 3,
							sourceId: 'laptop',
							workerId: 'w1',
							relaunches: [{ at: '2026-08-16T12:00:00.500Z', feedback: 'sub-step failed' }],
							meta: {
								duration_ms: 900,
								model: 'opus',
								session_id: 's',
								session_file: '/home/u/.claude/s.jsonl',
								ttft_ms: 10,
								cost: {
									input_tokens: 1,
									output_tokens: 2,
									cache_read_tokens: 0,
									cache_write_tokens: 0,
									usd: 0.5,
								},
							},
						},
					},
				}),
			},
			''
		);
		expect(detail.steps[0]).toMatchObject({
			stepId: 'ask',
			injected: true,
			attempts: 3,
			sourceId: 'laptop',
			workerId: 'w1',
			relaunches: [{ at: '2026-08-16T12:00:00.500Z', feedback: 'sub-step failed' }],
			model: 'opus',
			costUsd: 0.5,
		});
		expect(detail.totalCostUsd).toBe(0.5);
	});

	it('does not leak the step meta (session file paths, session ids)', () => {
		const detail = toExecutionDetail(
			{
				filePath: 'f',
				record: record({ steps: { s: { status: 'completed', meta: { duration_ms: 1, exit_code: 0 } } } }),
			},
			''
		);
		expect(JSON.stringify(detail)).not.toContain('session');
		expect(detail.steps[0]).not.toHaveProperty('meta');
	});

	it('has no totalCostUsd when no step reports a cost', () => {
		expect(toExecutionDetail(resolved, '')).not.toHaveProperty('totalCostUsd');
	});
});

describe('step cost in the detail view (per-attempt, session-cumulative)', () => {
	const modelMeta = (usd: number) => ({
		duration_ms: 1,
		model: 'haiku',
		session_id: 's1',
		session_file: '',
		ttft_ms: 1,
		cost: { input_tokens: 4, output_tokens: 8, cache_read_tokens: 0, cache_write_tokens: 0, usd },
	});
	const entry = (n: number, extra: Record<string, unknown>) => ({
		n,
		origin: n === 1 ? 'first' : 'relaunch',
		startedAt: '2026-08-16T12:00:00.000Z',
		endedAt: '2026-08-16T12:00:30.000Z',
		durationMs: 30_000,
		outcome: 'completed',
		endReason: 'completed',
		provider: 'claude',
		sessionId: 's1',
		...extra,
	});
	const detailOf = (steps: ExecutionState['steps']) =>
		toExecutionDetail({ filePath: 'f', record: record({ steps }) }, '');

	it('makes costUsd the step total, adds lastAttemptCostUsd and the attempts, from the measured capture', () => {
		const detail = detailOf({
			ask: {
				status: 'completed',
				attempts: 2,
				meta: modelMeta(0.00749017) as never,
				attemptLog: [
					entry(1, {
						usd: 0.00637995,
						turns: 2,
						toolCalls: 3,
						tokens: { input: 2, output: 4, cacheRead: 0, cacheWrite: 51022 },
					}),
					entry(2, { usd: 0.00749017, tokens: { input: 4, output: 8, cacheRead: 45902, cacheWrite: 56214 } }),
				] as never,
			},
		});
		const step = detail.steps[0]!;
		expect(step.costUsd).toBeCloseTo(0.00749017, 10);
		expect(step.lastAttemptCostUsd).toBeCloseTo(0.00111022, 10);
		expect(step.costComplete).toBe(true);
		expect(step.costLabel).toBe('$0.0075');
		expect(step.attemptHistory).toHaveLength(2);
		expect(step.attemptHistory![0]).toMatchObject({
			n: 1,
			origin: 'first',
			duration: '30.0s',
			endReason: 'completed',
			turns: 2,
			toolCalls: 3,
		});
		expect(step.attemptHistory![1]!.tokens).toEqual({ input: 2, output: 4, cacheRead: 45902, cacheWrite: 5192 });
		expect(step.attemptHistory![0]!.costUsd).toBeCloseTo(0.00637995, 10);
		expect(step.attemptHistory![1]!.costUsd).toBeCloseTo(0.00111022, 10);
		expect(detail.totalCostUsd).toBeCloseTo(0.00749017, 10);
		expect(detail.totalCostComplete).toBe(true);
		expect(detail.totalCostLabel).toBe('$0.0075');
	});

	it('a script step has no cost fields, flags its attempts as not applicable and keeps the total complete', () => {
		const scriptEntry = (n: number) => {
			const { provider: _provider, sessionId: _sessionId, ...bare } = entry(n, {});
			return bare;
		};
		const detail = detailOf({
			ask: {
				status: 'completed',
				attempts: 1,
				meta: modelMeta(0.00637995) as never,
				attemptLog: [entry(1, { usd: 0.00637995 })] as never,
			},
			check: {
				status: 'completed',
				attempts: 2,
				meta: { duration_ms: 1, exit_code: 0 } as never,
				attemptLog: [scriptEntry(1), scriptEntry(2)] as never,
			},
		});
		const check = detail.steps.find(step => step.stepId === 'check')!;
		expect(check.costLabel).toBeUndefined();
		expect(check.costComplete).toBeUndefined();
		expect(check.attemptHistory).toHaveLength(2);
		expect(
			check.attemptHistory!.every(a => a.costNotApplicable === true && a.costUnknownReason === undefined)
		).toBe(true);
		expect(detail.totalCostComplete).toBe(true);
		expect(detail.totalCostLabel).toBe('$0.0064');
	});

	it('flags an incomplete total and never turns an unknown cost into 0', () => {
		const detail = detailOf({
			a: {
				status: 'completed',
				attempts: 2,
				meta: modelMeta(2) as never,
				attemptLog: [entry(1, { usd: 2 }), entry(2, { usd: undefined, outcome: 'failed' })] as never,
			},
			b: {
				status: 'failed',
				attempts: 1,
				meta: modelMeta(0) as never,
				attemptLog: [entry(1, { usd: undefined, outcome: 'failed' })] as never,
			},
		});
		expect(detail.steps[0]).toMatchObject({
			costUsd: 2,
			costComplete: false,
			costLabel: '$2.0000+ (1 attempt unknown)',
		});
		expect(detail.steps[0]!.attemptHistory![1]!).not.toHaveProperty('costUsd');
		expect(detail.steps[1]).not.toHaveProperty('costUsd');
		expect(detail.steps[1]).toMatchObject({ costComplete: false, costLabel: 'unknown' });
		expect(detail.totalCostUsd).toBe(2);
		expect(detail.totalCostComplete).toBe(false);
		expect(detail.totalCostLabel).toBe('$2.0000+ (2 attempts unknown)');
	});

	it('shows an unknown total when no costed step has a known cost, and nothing for a record without cost', () => {
		const unknown = detailOf({
			b: {
				status: 'failed',
				attemptLog: [entry(1, { usd: undefined, outcome: 'failed' })] as never,
			},
		});
		expect(unknown).not.toHaveProperty('totalCostUsd');
		expect(unknown).toMatchObject({ totalCostComplete: false, totalCostLabel: 'unknown' });
		expect(toExecutionDetail({ filePath: 'f', record: record() }, '')).not.toHaveProperty('totalCostLabel');
	});

	it('labels an old record that ran several times without a log', () => {
		const detail = detailOf({ old: { status: 'completed', attempts: 3, meta: modelMeta(0.3) as never } });
		expect(detail.steps[0]).toMatchObject({
			costUsd: 0.3,
			costComplete: false,
			costLabel: '$0.3000 (last attempt of 3, earlier not recorded)',
		});
		expect(detail.steps[0]).not.toHaveProperty('attemptHistory');
	});
});

describe('project fields of the views', () => {
	it('exposes projectId and projectLabel (name (id)) next to projectRoot when a lookup is given', () => {
		const summary = toExecutionSummary(record({ projectId: 'a1b2c3d4', projectRoot: '/work/app' }), () => ({
			kind: 'known',
			name: 'app',
		}));
		expect(summary).toMatchObject({
			projectId: 'a1b2c3d4',
			projectRoot: '/work/app',
			projectLabel: 'app (a1b2c3d4)',
		});
	});

	it('labels a record with only projectRoot as "<root> (-)" and leaves projectId out', () => {
		const summary = toExecutionSummary(record({ projectRoot: '/work/app' }));
		expect(summary.projectLabel).toBe('/work/app (-)');
		expect(summary).not.toHaveProperty('projectId');
	});

	it('has neither field for a record without a project', () => {
		const summary = toExecutionSummary(record());
		expect(summary).not.toHaveProperty('projectId');
		expect(summary).not.toHaveProperty('projectLabel');
	});
});
