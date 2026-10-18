import type { ExecutionRecord } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { toExecutionDetail, toExecutionSummary } from './ExecutionView.js';

function record(partial: Partial<ExecutionRecord> = {}): ExecutionRecord {
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
			stepCount: 2,
			failedStepCount: 1,
		});
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
