import type { StepMeta } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { ExecutionStore } from './ExecutionStore';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');
const EXEC_ID = 'abcd1234';

function modelMeta(overrides: Record<string, unknown> = {}): StepMeta {
	return {
		model: 'haiku',
		session_id: 's1',
		session_file: '',
		ttft_ms: 5,
		duration_ms: 1000,
		cost: {
			input_tokens: 10,
			output_tokens: 20,
			cache_read_tokens: 30,
			cache_write_tokens: 40,
			usd: 0.5,
			reported: true,
		},
		turns: 4,
		tool_calls: { total: 9, by_tool: { Bash: 9 } },
		files_written: ['/a'],
		files_written_count: 3,
		end_reason: 'completed',
		...overrides,
	} as StepMeta;
}

describe('ExecutionStore attemptLog', () => {
	let dir: string;
	let store: ExecutionStore;
	const stepOf = (id = 'a') => store.read(EXEC_ID).steps[id]!;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-attempts-'));
		store = new ExecutionStore(dir);
		store.create({ executionId: EXEC_ID, flowFile: 'f.yml', flowId: 'f', stepIds: ['a', 'b'] });
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('writes one entry when an attempt completes, with the figures its meta reported', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());

		const log = stepOf().attemptLog!;
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({
			n: 1,
			origin: 'first',
			outcome: 'completed',
			endReason: 'completed',
			model: 'haiku',
			usd: 0.5,
			tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
			turns: 4,
			toolCalls: 9,
			filesWrittenCount: 3,
		});
		expect(log[0]!.durationMs).toBe(new Date(log[0]!.endedAt).getTime() - new Date(log[0]!.startedAt).getTime());
	});

	it('keeps the failed attempt that the next attempt used to overwrite', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'exit 1', undefined, undefined, undefined, {
			meta: modelMeta({ end_reason: 'exit_nonzero', cost: { ...(modelMeta() as any).cost, usd: 2.4 } }),
		});
		store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'retry');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());
		store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'loop');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta({ end_reason: 'completed' }));

		const log = stepOf().attemptLog!;
		expect(log.map(e => [e.n, e.origin, e.outcome, e.endReason])).toEqual([
			[1, 'first', 'failed', 'exit_nonzero'],
			[2, 'retry', 'completed', 'completed'],
			[3, 'loop', 'completed', 'completed'],
		]);
		expect(log[0]!.usd).toBe(2.4);
		expect(log[0]!.error).toBe('exit 1');
		// meta keeps meaning "last attempt"
		expect(stepOf().meta).toEqual(modelMeta());
	});

	it('records a failure reported without a meta with NO usd (unknown, never zero) and endReason step_error', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'boom');

		const entry = stepOf().attemptLog![0]!;
		expect(entry.outcome).toBe('failed');
		expect(entry.endReason).toBe('step_error');
		expect(entry.usd).toBeUndefined();
		expect('usd' in entry).toBe(false);
		expect(entry.tokens).toBeUndefined();
	});

	it('records usd unknown when the attempt flagged its cost as not reported, but keeps the turns and tools it saw', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'timed out', undefined, undefined, undefined, {
			meta: modelMeta({
				end_reason: 'timeout',
				turns: undefined,
				cost: {
					input_tokens: 0,
					output_tokens: 0,
					cache_read_tokens: 0,
					cache_write_tokens: 0,
					usd: 0,
					reported: false,
				},
			}),
		});

		const entry = stepOf().attemptLog![0]!;
		expect(entry.endReason).toBe('timeout');
		expect('usd' in entry).toBe(false);
		expect(entry.toolCalls).toBe(9);
	});

	it('reads a meta written before cost.reported existed as reported', () => {
		store.markStepRunning(EXEC_ID, 'a');
		const old = modelMeta();
		delete (old as any).cost.reported;
		delete (old as any).end_reason;
		store.markStepCompleted(EXEC_ID, 'a', old);

		const entry = stepOf().attemptLog![0]!;
		expect(entry.usd).toBe(0.5);
		expect(entry.endReason).toBe('completed');
	});

	it('records a script attempt from its meta: exit reason, no model figures', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'exit 3', undefined, undefined, undefined, {
			meta: { exit_code: 3, duration_ms: 9, end_reason: 'exit_nonzero' } as StepMeta,
		});

		const entry = stepOf().attemptLog![0]!;
		expect(entry.endReason).toBe('exit_nonzero');
		expect(entry.model).toBeUndefined();
		expect('usd' in entry).toBe(false);
	});

	it('marks a relaunch with its index into relaunches[] and a resumed step as resume', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());
		store.markStepRunning(EXEC_ID, 'a', undefined, 'sub-step x failed');
		store.markStepFailed(EXEC_ID, 'a', 'unanswered');
		store.markExecutionResumed(EXEC_ID, 'a');
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());

		const log = stepOf().attemptLog!;
		expect(log.map(e => e.origin)).toEqual(['first', 'relaunch', 'resume']);
		expect(log[1]!.relaunchIndex).toBe(0);
		expect(log[0]!.relaunchIndex).toBeUndefined();
	});

	it('keeps the log when the scheduler resets a step to pending and when it runs again', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());

		store.markStepsPending(EXEC_ID, ['a']);
		expect(stepOf().attemptLog).toHaveLength(1);

		store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'loop');
		expect(stepOf().attemptLog).toHaveLength(1);
		expect(stepOf().runningAttempt).toEqual({ origin: 'loop' });
	});

	it('adds no entry for a step that never ran (skipped, or settled without an attempt)', () => {
		store.markStepSkipped(EXEC_ID, 'a', 'dependency failed');
		store.markStepCompleted(EXEC_ID, 'b');

		expect(stepOf('a').attemptLog).toBeUndefined();
		expect(stepOf('b').attemptLog).toBeUndefined();
	});

	it('records an engine failure as engine_failed with the given reason and no usd', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', 'worker lost', undefined, undefined, undefined, {
			engineEndReason: 'worker_lost',
		});

		const entry = stepOf().attemptLog![0]!;
		expect(entry.outcome).toBe('engine_failed');
		expect(entry.endReason).toBe('worker_lost');
		expect('usd' in entry).toBe(false);
	});

	it('does not add an attempt when a step that is not running is failed afterwards (parent failed by the engine)', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());

		store.markStepFailed(EXEC_ID, 'a', 'a sub-step failed', undefined, undefined, undefined, {
			engineEndReason: 'engine_failed',
		});

		expect(stepOf().attemptLog).toHaveLength(1);
		expect(stepOf().status).toBe('failed');
	});

	it('abandons the running steps when the execution ends: abandoned / execution_ended, no usd', () => {
		store.markStepRunning(EXEC_ID, 'a');

		store.markExecutionFailed(EXEC_ID);

		const entry = stepOf().attemptLog![0]!;
		expect(entry.outcome).toBe('abandoned');
		expect(entry.endReason).toBe('execution_ended');
		expect('usd' in entry).toBe(false);
	});

	it('abandons the running steps of an execution interrupted by a daemon restart', () => {
		store.markStepRunning(EXEC_ID, 'a');

		store.reconcileInterruptedExecutions();

		expect(stepOf().attemptLog![0]).toMatchObject({ outcome: 'abandoned', endReason: 'execution_ended' });
	});

	it('truncates the error to 500 characters and masks declared secrets', () => {
		const masks = new ExecutionMasks();
		masks.register(EXEC_ID, new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
		const masked = new ExecutionStore(dir, 30, masks);
		masked.markStepRunning(EXEC_ID, 'a');

		masked.markStepFailed(EXEC_ID, 'a', `${TOKEN} ${'x'.repeat(900)}`);

		const entry = masked.read(EXEC_ID).steps['a']!.attemptLog![0]!;
		expect(entry.error!.length).toBeLessThanOrEqual(500);
		expect(JSON.stringify(masked.read(EXEC_ID))).not.toContain(TOKEN);
	});

	it('loads a record written before attemptLog existed unchanged and starts the log at the next attempt', () => {
		const file = path.join(dir, `${EXEC_ID}.json`);
		const record = JSON.parse(fs.readFileSync(file, 'utf8'));
		record.steps.a = { status: 'completed', attempts: 2, priorAttemptsMs: 5, meta: { duration_ms: 1 } };
		fs.writeFileSync(file, JSON.stringify(record));

		expect(stepOf().attemptLog).toBeUndefined();
		store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'loop');
		store.markStepCompleted(EXEC_ID, 'a', modelMeta());

		const log = stepOf().attemptLog!;
		expect(log).toHaveLength(1);
		expect(log[0]!.n).toBe(3);
		expect(stepOf().attemptOverflow).toBeUndefined();
	});

	describe('caps', () => {
		const runAttempts = (stepId: string, count: number, usd: number | undefined): void => {
			for (let i = 0; i < count; i++) {
				store.markStepRunning(EXEC_ID, stepId, undefined, undefined, 'loop');
				store.markStepCompleted(
					EXEC_ID,
					stepId,
					usd === undefined
						? ({ duration_ms: 1 } as StepMeta)
						: modelMeta({ cost: { ...(modelMeta() as any).cost, usd } })
				);
			}
		};

		it('folds the oldest entries of a step past 50 into attemptOverflow so totals stay correct', () => {
			runAttempts('a', 10, undefined);
			runAttempts('a', 45, 0.5);

			const step = stepOf();
			expect(step.attemptLog).toHaveLength(50);
			expect(step.attemptOverflow).toEqual({
				count: 5,
				usd: 0,
				usdUnknownCount: 5,
				durationMs: expect.any(Number),
			});
			// Oldest first: the 5 oldest (all unknown) were folded, so the first kept is attempt 6
			expect(step.attemptLog![0]!.n).toBe(6);
			expect(step.attempts).toBe(55);
		});

		it('folds the oldest entries of the execution past 400, whichever step holds them', () => {
			runAttempts('a', 25, 1);
			runAttempts('b', 25, 2);
			const file = path.join(dir, `${EXEC_ID}.json`);
			const record = JSON.parse(fs.readFileSync(file, 'utf8'));
			const filler = (stepId: string, usd: number) => ({
				status: 'completed',
				attempts: 50,
				attemptLog: Array.from({ length: 50 }, (_, i) => ({
					n: i + 1,
					origin: 'loop',
					startedAt: '2020-01-01T00:00:00.000Z',
					endedAt: '2020-01-01T00:00:01.000Z',
					durationMs: 1000,
					outcome: 'completed',
					endReason: 'completed',
					usd,
				})),
			});
			for (let i = 0; i < 7; i++) record.steps[`f${String(i)}`] = filler(`f${String(i)}`, 3);
			fs.writeFileSync(file, JSON.stringify(record));
			// 25 + 25 + 7*50 = 400 entries now: one more attempt crosses the cap
			store.markStepRunning(EXEC_ID, 'a', undefined, undefined, 'loop');
			store.markStepCompleted(EXEC_ID, 'a', modelMeta());

			const steps = Object.values(store.read(EXEC_ID).steps);
			const kept = steps.reduce((sum, s) => sum + (s.attemptLog?.length ?? 0), 0);
			const folded = steps.reduce((sum, s) => sum + (s.attemptOverflow?.count ?? 0), 0);
			expect(kept).toBe(400);
			// 401 existed, 1 folded; the oldest by endedAt are the 2020 filler entries
			expect(folded).toBeGreaterThanOrEqual(1);
			const overflowed = steps.find(s => s.attemptOverflow !== undefined)!;
			expect(overflowed.attemptOverflow!.usd).toBe(3);
		});
	});
});
