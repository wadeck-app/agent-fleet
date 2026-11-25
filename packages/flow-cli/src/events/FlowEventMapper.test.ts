import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { ExecutionStore } from '../storage/ExecutionStore';
import { RecordingFlowEventPublisher } from '../test-utils/RecordingFlowEventPublisher';
import { FlowEventMapper, firstLineOf } from './FlowEventMapper';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const EXEC_ID = 'abcd1234';

describe('FlowEventMapper over ExecutionStore transitions', () => {
	let dir: string;
	let publisher: RecordingFlowEventPublisher;
	let reported: unknown[];
	let masks: ExecutionMasks;
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-events-'));
		publisher = new RecordingFlowEventPublisher();
		reported = [];
		masks = new ExecutionMasks();
		const mapper = new FlowEventMapper(publisher, err => reported.push(err));
		store = new ExecutionStore(dir, 30, masks, mapper);
		store.create({
			executionId: EXEC_ID,
			flowFile: 'f.yml',
			flowId: 'my-flow',
			stepIds: ['a', 'b'],
			projectRoot: '/work/project',
		});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('publishes nothing when the execution is merely created', () => {
		expect(publisher.events).toEqual([]);
	});

	it('publishes execution.started then step.started on the first dispatch, with the attempt', () => {
		store.markStepRunning(EXEC_ID, 'a');
		expect(publisher.names()).toEqual(['flow.execution.started', 'flow.step.started']);
		expect(publisher.events[0]!.payload).toMatchObject({
			executionId: EXEC_ID,
			flowId: 'my-flow',
			status: 'running',
			projectRoot: '/work/project',
		});
		expect(publisher.events[0]!.payload.stepId).toBeUndefined();
		expect(publisher.events[1]!.payload).toMatchObject({
			executionId: EXEC_ID,
			flowId: 'my-flow',
			stepId: 'a',
			status: 'running',
			attempt: 1,
		});
		expect(typeof publisher.events[1]!.payload.startedAt).toBe('string');
	});

	it('does not republish execution.started for a second step', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a');
		store.markStepRunning(EXEC_ID, 'b');
		expect(publisher.names().filter(n => n === 'flow.execution.started')).toHaveLength(1);
	});

	it('publishes step.completed with timing, then execution.completed', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a');
		store.markExecutionCompleted(EXEC_ID);
		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.completed',
			'flow.execution.completed',
		]);
		const step = publisher.events[2]!.payload;
		expect(step).toMatchObject({ stepId: 'a', status: 'completed', attempt: 1 });
		expect(typeof step.completedAt).toBe('string');
		expect(step.durationMs).toBeGreaterThanOrEqual(0);
		const execution = publisher.events[3]!.payload;
		expect(execution).toMatchObject({ executionId: EXEC_ID, status: 'completed' });
		expect(typeof execution.durationMs).toBe('number');
		expect(execution.error).toBeUndefined();
	});

	describe('cost fields of step events', () => {
		const model = (usd: number, extra: Record<string, unknown> = {}) =>
			({
				model: 'haiku',
				provider: 'claude',
				session_id: 'sess-1',
				session_file: '',
				ttft_ms: 1,
				duration_ms: 1000,
				cost: {
					input_tokens: 1,
					output_tokens: 2,
					cache_read_tokens: 0,
					cache_write_tokens: 0,
					usd,
					reported: true,
				},
				turns: 3,
				tool_calls: { total: 7, by_tool: { Bash: 7 } },
				end_reason: 'completed',
				...extra,
			}) as never;

		it('puts this attempt share, the step total so far and the end reason on step.completed (session-cumulative cost resolved)', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a', model(0.00637995));
			store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'loop');
			store.markStepCompleted(EXEC_ID, 'a', model(0.00749017));

			const second = publisher.events.filter(e => e.event === 'flow.step.completed')[1]!.payload;
			expect(second.costUsd).toBeCloseTo(0.00111022, 10);
			expect(second.stepTotalCostUsd).toBeCloseTo(0.00749017, 10);
			expect(second).toMatchObject({
				stepTotalCostComplete: true,
				turns: 3,
				toolCalls: 7,
				endReason: 'completed',
			});
		});

		it('leaves the cost out (never 0) when the attempt reported none, and marks the total incomplete', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepFailed(EXEC_ID, 'a', 'killed', undefined, undefined, undefined, {
				meta: model(0, {
					cost: {
						input_tokens: 0,
						output_tokens: 0,
						cache_read_tokens: 0,
						cache_write_tokens: 0,
						usd: 0,
						reported: false,
					},
					end_reason: 'timeout',
				}),
			});

			const failed = publisher.events.find(e => e.event === 'flow.step.failed')!.payload;
			expect(failed).not.toHaveProperty('costUsd');
			expect(failed).not.toHaveProperty('stepTotalCostUsd');
			expect(failed).toMatchObject({ stepTotalCostComplete: false, endReason: 'timeout' });
		});

		const codexEstimated = (usd: number) =>
			model(0, {
				provider: 'codex',
				model: 'openai.gpt-5.6-luna',
				cost: {
					input_tokens: 42,
					output_tokens: 5,
					cache_read_tokens: 0,
					cache_write_tokens: 9302,
					usd,
					reported: false,
					estimated: true,
					pricesAsOf: '2026-11-08',
				},
			});

		it('puts the run total on execution.completed, summed from the step totals, flagged exact when nothing is estimated', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a', model(0.25));
			store.markStepRunning(EXEC_ID, 'b');
			store.markStepCompleted(EXEC_ID, 'b', model(0.5, { session_id: 'sess-2' }));
			store.markExecutionCompleted(EXEC_ID);

			const execution = publisher.events.find(e => e.event === 'flow.execution.completed')!.payload;
			expect(execution.totalCostUsd).toBeCloseTo(0.75, 10);
			expect(execution).toMatchObject({ totalCostComplete: true, totalCostEstimated: false });
		});

		it('flags the run total as an estimate when a codex step is priced locally, on step and execution events', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a', model(0.25));
			store.markStepRunning(EXEC_ID, 'b');
			store.markStepCompleted(EXEC_ID, 'b', codexEstimated(0.00257389));
			store.markExecutionCompleted(EXEC_ID);

			const codexStep = publisher.events.filter(e => e.event === 'flow.step.completed')[1]!.payload;
			expect(codexStep.stepTotalCostUsd).toBeCloseTo(0.00257389, 12);
			expect(codexStep.stepTotalCostEstimated).toBe(true);
			const execution = publisher.events.find(e => e.event === 'flow.execution.completed')!.payload;
			expect(execution.totalCostUsd).toBeCloseTo(0.25257389, 10);
			expect(execution).toMatchObject({ totalCostComplete: true, totalCostEstimated: true });
		});

		it('puts the run total on execution.failed too, a lower bound when an attempt cost is unknown, and omits the usd when nothing is known', () => {
			const unreported = model(0, {
				cost: {
					input_tokens: 0,
					output_tokens: 0,
					cache_read_tokens: 0,
					cache_write_tokens: 0,
					usd: 0,
					reported: false,
				},
			});
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepFailed(EXEC_ID, 'a', 'killed', undefined, undefined, undefined, { meta: unreported });
			store.markExecutionFailed(EXEC_ID);

			const execution = publisher.events.find(e => e.event === 'flow.execution.failed')!.payload;
			expect(execution).not.toHaveProperty('totalCostUsd');
			expect(execution).toMatchObject({ totalCostComplete: false, totalCostEstimated: false });
		});

		it('adds no run total to execution.started, nor to a run without any model cost', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a');
			store.markExecutionCompleted(EXEC_ID);

			const started = publisher.events.find(e => e.event === 'flow.execution.started')!.payload;
			const completed = publisher.events.find(e => e.event === 'flow.execution.completed')!.payload;
			for (const payload of [started, completed]) {
				expect(payload).not.toHaveProperty('totalCostUsd');
				expect(payload).not.toHaveProperty('totalCostComplete');
				expect(payload).not.toHaveProperty('totalCostEstimated');
			}
		});

		it('adds no cost field for a step without model cost (script step)', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a');

			const completed = publisher.events.find(e => e.event === 'flow.step.completed')!.payload;
			expect(Object.keys(completed)).not.toEqual(expect.arrayContaining(['costUsd']));
			expect(completed).not.toHaveProperty('stepTotalCostUsd');
		});
	});

	it('does not publish step.completed for a step that was skipped and never ran', () => {
		store.markStepCompleted(EXEC_ID, 'b');
		expect(publisher.events).toEqual([]);
	});

	it('publishes step.failed with the error, then execution.failed with the last error', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'boom');
		store.markExecutionFailed(EXEC_ID);
		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.failed',
			'flow.execution.failed',
		]);
		expect(publisher.events[2]!.payload).toMatchObject({
			stepId: 'a',
			status: 'failed',
			attempt: 1,
			error: 'boom',
		});
		expect(publisher.events[3]!.payload).toMatchObject({ status: 'failed', error: 'boom' });
	});

	it('a failed then retried step publishes failed, then started again with attempt + 1, and the execution is not completed', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'flaky');
		store.markStepRunning(EXEC_ID, 'a');
		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.failed',
			'flow.step.started',
		]);
		expect(publisher.events[3]!.payload.attempt).toBe(2);
		expect(publisher.events[3]!.payload.error).toBeUndefined();
	});

	it('publishes each terminal transition once even if the store is told twice', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'boom');
		store.markStepFailed(EXEC_ID, 'a', 'boom');
		store.markExecutionFailed(EXEC_ID);
		store.markExecutionFailed(EXEC_ID);
		expect(publisher.names().filter(n => n === 'flow.step.failed')).toHaveLength(1);
		expect(publisher.names().filter(n => n === 'flow.execution.failed')).toHaveLength(1);
	});

	it('resume: the execution is not started again, the resumed step starts with attempt + 1', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'unanswered');
		store.markExecutionFailed(EXEC_ID);
		store.markExecutionResumed(EXEC_ID, 'a');
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a');
		store.markExecutionCompleted(EXEC_ID);
		expect(publisher.names()).toEqual([
			'flow.execution.started',
			'flow.step.started',
			'flow.step.failed',
			'flow.execution.failed',
			'flow.step.started',
			'flow.step.completed',
			'flow.execution.completed',
		]);
		expect(publisher.events[4]!.payload.attempt).toBe(2);
	});

	it('omits projectRoot when the execution has none', () => {
		store.create({ executionId: 'ffff0000', flowFile: 'f.yml', flowId: 'x', stepIds: ['a'] });
		store.markStepRunning('ffff0000', 'a');
		expect(publisher.events[0]!.payload).not.toHaveProperty('projectRoot');
	});

	it('keeps only the first line of the error and caps it at 200 characters', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', `${'x'.repeat(500)}\nsecond line\nthird`);
		const failed = publisher.events.find(e => e.event === 'flow.step.failed')!.payload;
		expect(failed.error).toHaveLength(200);
		expect(failed.error!.endsWith('...')).toBe(true);
		expect(failed.error).not.toContain('second line');
	});

	it('keeps every payload small, whatever the error and its output', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'e'.repeat(100_000), 'o'.repeat(100_000), 'r'.repeat(100_000));
		store.markExecutionFailed(EXEC_ID);
		for (const { payload } of publisher.events) {
			expect(JSON.stringify(payload).length).toBeLessThan(1024);
		}
	});

	it('never carries step stdout or stderr', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'boom', 'STDOUT-MARKER', 'STDERR-MARKER');
		expect(JSON.stringify(publisher.events)).not.toMatch(/MARKER/);
	});

	describe('secrets', () => {
		it('never hands a declared secret value to the publisher, in the step or the execution event', () => {
			masks.register(EXEC_ID, new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepFailed(EXEC_ID, 'a', `login failed with ${TOKEN}`);
			store.markExecutionFailed(EXEC_ID);
			const serialized = JSON.stringify(publisher.events);
			expect(serialized).not.toContain(TOKEN);
			expect(serialized).toContain('login failed with [secret:API_TOKEN]');
		});
	});

	describe('a broken publisher', () => {
		it('never breaks the run: the transition is recorded and the failure is reported', () => {
			publisher.publishError = new Error('queue exploded');
			expect(() => store.markStepRunning(EXEC_ID, 'a')).not.toThrow();
			expect(store.read(EXEC_ID).steps['a']!.status).toBe('running');
			expect(reported.length).toBeGreaterThan(0);
			expect(String(reported[0])).toContain('queue exploded');
		});
	});
});

describe('firstLineOf', () => {
	it('returns the first non-empty line, trimmed', () => {
		expect(firstLineOf('\n  \r\n  real problem  \nnext', 200)).toBe('real problem');
	});

	it('returns undefined for undefined and for blank text', () => {
		expect(firstLineOf(undefined, 200)).toBeUndefined();
		expect(firstLineOf('  \n ', 200)).toBeUndefined();
	});

	it('leaves a short line untouched and truncates a long one to exactly the cap, with an ellipsis', () => {
		expect(firstLineOf('short', 10)).toBe('short');
		expect(firstLineOf('abcdefghijklmnop', 10)).toBe('abcdefg...');
	});
});

describe('FlowEventMapper projectId', () => {
	it('puts projectId next to projectRoot in execution and step payloads, and omits it for an old record', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-events-pid-'));
		try {
			const publisher = new RecordingFlowEventPublisher();
			const store = new ExecutionStore(
				dir,
				30,
				new ExecutionMasks(),
				new FlowEventMapper(publisher, err => {
					throw err;
				})
			);
			store.create({
				executionId: 'pid00001',
				flowFile: 'f.yml',
				flowId: 'f',
				stepIds: ['a'],
				projectId: 'a1b2c3d4',
				projectRoot: '/work/app',
			});
			store.create({
				executionId: 'pid00002',
				flowFile: 'f.yml',
				flowId: 'f',
				stepIds: ['a'],
				projectRoot: '/old',
			});
			store.markStepRunning('pid00001', 'a');
			store.markStepRunning('pid00002', 'a');
			const payloads = publisher.events.map(e => e.payload);
			expect(payloads.slice(0, 2)).toEqual([
				expect.objectContaining({ projectId: 'a1b2c3d4', projectRoot: '/work/app' }),
				expect.objectContaining({ stepId: 'a', projectId: 'a1b2c3d4', projectRoot: '/work/app' }),
			]);
			expect(payloads[2]).not.toHaveProperty('projectId');
			expect(payloads[2]).toHaveProperty('projectRoot', '/old');
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('FlowEventMapper pause and unpause', () => {
	let dir: string;
	let publisher: RecordingFlowEventPublisher;
	let masks: ExecutionMasks;
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-events-pause-'));
		publisher = new RecordingFlowEventPublisher();
		masks = new ExecutionMasks();
		store = new ExecutionStore(
			dir,
			30,
			masks,
			new FlowEventMapper(publisher, err => {
				throw err;
			})
		);
		store.create({
			executionId: EXEC_ID,
			flowFile: 'f.yml',
			flowId: 'my-flow',
			stepIds: ['a', 'b'],
			projectRoot: '/work/project',
		});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	describe('pause and unpause', () => {
		it('publishes flow.execution.paused with status paused, pausedAt and the first line of the reason', () => {
			store.markExecutionPaused(EXEC_ID, 'budget exceeded: 5.02 USD\nmore detail');

			expect(publisher.names()).toEqual(['flow.execution.paused']);
			const payload = publisher.events[0]!.payload;
			expect(payload).toMatchObject({
				executionId: EXEC_ID,
				flowId: 'my-flow',
				status: 'paused',
				reason: 'budget exceeded: 5.02 USD',
				pausedAt: store.read(EXEC_ID).paused!.since,
			});
			expect(payload).not.toHaveProperty('completedAt');
		});

		it('omits the reason when none was given', () => {
			store.markExecutionPaused(EXEC_ID);

			expect(publisher.events[0]!.payload).not.toHaveProperty('reason');
		});

		it('masks a declared secret in the reason before it reaches the queue', () => {
			masks.register(EXEC_ID, [{ name: 'T', value: TOKEN }] as never);
			store.markExecutionPaused(EXEC_ID, `token ${TOKEN} leaked`);

			expect(JSON.stringify(publisher.events)).not.toContain(TOKEN);
		});

		it('publishes flow.execution.resumed with both timestamps, and records the paused time', () => {
			store.markExecutionPaused(EXEC_ID, 'why');
			const pausedAt = store.read(EXEC_ID).paused!.since;
			store.markExecutionUnpaused(EXEC_ID);

			expect(publisher.names()).toEqual(['flow.execution.paused', 'flow.execution.resumed']);
			expect(publisher.events[1]!.payload).toMatchObject({ status: 'running', pausedAt });
			expect(publisher.events[1]!.payload.resumedAt).toBeDefined();
			const record = store.read(EXEC_ID);
			expect(record.paused).toBeUndefined();
			expect(record.pausedMs).toBeGreaterThanOrEqual(0);
		});

		it('refuses to record an unpause for a run that is not paused, instead of publishing a false event', () => {
			expect(() => store.markExecutionUnpaused(EXEC_ID)).toThrow(/not paused/);
			expect(publisher.events).toEqual([]);
		});

		it('drops the paused flag when the run ends while paused and keeps the time it was paused', () => {
			store.markExecutionPaused(EXEC_ID, 'why');
			store.markExecutionFailed(EXEC_ID);

			const record = store.read(EXEC_ID);
			expect(record.paused).toBeUndefined();
			expect(record.pausedMs).toBeGreaterThanOrEqual(0);
			expect(publisher.names()).toEqual(['flow.execution.paused', 'flow.execution.failed']);
		});

		it('a daemon restart ends a paused run as failed (interrupted), naming the pause, and clears the flag', () => {
			store.markStepRunning(EXEC_ID, 'a');
			store.markExecutionPaused(EXEC_ID, 'budget exceeded');

			expect(store.reconcileInterruptedExecutions()).toBe(1);

			const record = store.read(EXEC_ID);
			expect(record.status).toBe('failed');
			expect(record.paused).toBeUndefined();
			expect(record.lastError).toContain('paused');
			expect(record.lastError).toContain('budget exceeded');
		});
	});
});

describe('FlowEventMapper step deferred', () => {
	let dir: string;
	let publisher: RecordingFlowEventPublisher;
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-events-deferred-'));
		publisher = new RecordingFlowEventPublisher();
		store = new ExecutionStore(
			dir,
			30,
			new ExecutionMasks(),
			new FlowEventMapper(publisher, err => {
				throw err;
			})
		);
		store.create({
			executionId: EXEC_ID,
			flowFile: 'f.yml',
			flowId: 'my-flow',
			stepIds: ['a'],
			projectRoot: '/work/project',
		});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('publishes flow.step.deferred with reason, message, phase, retry and worker source, for the attempt that waits', () => {
		store.notifyStepDeferred(EXEC_ID, 'a', {
			reason: 'sso-expired',
			message: 'The SSO session expired\nsecond line',
			phase: 'worker',
			retryAfterSeconds: 30,
			workerSource: 'sandbox',
		});

		expect(publisher.names()).toEqual(['flow.step.deferred']);
		expect(publisher.events[0]!.payload).toEqual({
			executionId: EXEC_ID,
			flowId: 'my-flow',
			stepId: 'a',
			status: 'deferred',
			attempt: 1,
			projectRoot: '/work/project',
			reason: 'sso-expired',
			message: 'The SSO session expired',
			phase: 'worker',
			retryAfterSeconds: 30,
			workerSource: 'sandbox',
		});
	});

	it('writes nothing to the record: the step is still queued', () => {
		const before = JSON.stringify(store.read(EXEC_ID));
		store.notifyStepDeferred(EXEC_ID, 'a', { reason: 'r', message: 'm', phase: 'ack', retryAfterSeconds: 5 });
		expect(JSON.stringify(store.read(EXEC_ID))).toBe(before);
	});
});
