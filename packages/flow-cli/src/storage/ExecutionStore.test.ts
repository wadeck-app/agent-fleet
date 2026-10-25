import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from './ExecutionStore';

describe('ExecutionStore', () => {
	let tmpDir: string;
	let store: ExecutionStore;
	const EXEC_ID = 'abcd1234';

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-'));
		store = new ExecutionStore(tmpDir);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe('create()', () => {
		it('creates state file with status queued and all steps as pending', () => {
			const state = store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a', 'step-b'],
			});

			expect(state.executionId).toBe(EXEC_ID);
			expect(state.status).toBe('queued');
			expect(state.flowId).toBe('my-flow');
			expect(state.steps['step-a'].status).toBe('pending');
			expect(state.steps['step-b'].status).toBe('pending');
			expect(state.currentSteps).toEqual([]);
			expect(state.completedAt).toBeNull();

			const filePath = path.join(tmpDir, `${EXEC_ID}.json`);
			expect(fs.existsSync(filePath)).toBe(true);
		});
	});

	describe('create() with stepWaves', () => {
		it('records the wave of the sub-steps that have one (wave 0 included) and of no other step', () => {
			const state = store.create({
				executionId: EXEC_ID,
				flowFile: 'f.yml',
				flowId: 'my-flow',
				stepIds: ['impl', 'zero', 'late'],
				stepWaves: { zero: 0, late: 2 },
			});

			expect(state.steps['impl']).toEqual({ status: 'pending' });
			expect(state.steps['zero']).toEqual({ status: 'pending', wave: 0 });
			expect(state.steps['late']).toEqual({ status: 'pending', wave: 2 });
			expect(store.read(EXEC_ID).steps['late']).toMatchObject({ wave: 2 });
		});

		it('fails loudly on a wave for a step that is not in the execution', () => {
			expect(() =>
				store.create({
					executionId: EXEC_ID,
					flowFile: 'f.yml',
					flowId: 'my-flow',
					stepIds: ['a'],
					stepWaves: { ghost: 1 },
				})
			).toThrow("stepWaves names 'ghost'");
		});
	});

	describe('create() with a definition', () => {
		it('records version, hash, snapshot and choice, which survive later updates', () => {
			const definition = {
				flowVersion: '1.2.0',
				definitionHash: 'a'.repeat(64),
				definitionSnapshot: 'my-flow/1.2.0-aaaaaaaaaaaa.yml',
				versionChoice: 'pinned' as const,
			};

			store.create({ executionId: EXEC_ID, flowFile: 'f.yml', flowId: 'my-flow', stepIds: ['a'], definition });
			store.markStepRunning(EXEC_ID, 'a');

			expect(store.read(EXEC_ID)).toMatchObject(definition);
		});

		it('writes none of the version fields when no definition is given (record shape of older daemons)', () => {
			store.create({ executionId: EXEC_ID, flowFile: 'f.yml', flowId: 'my-flow', stepIds: ['a'] });

			const record = store.read(EXEC_ID);
			for (const field of ['flowVersion', 'definitionHash', 'definitionSnapshot', 'versionChoice']) {
				expect(record).not.toHaveProperty(field);
			}
		});
	});

	describe('read()', () => {
		it('reads back the created state', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});

			const state = store.read(EXEC_ID);
			expect(state.executionId).toBe(EXEC_ID);
			expect(state.status).toBe('queued');
		});

		it('throws on missing file using a valid id that does not exist', () => {
			expect(() => store.read('ffffffff')).toThrow(/Corrupted execution state for ffffffff/);
		});
	});

	describe('markStepRunning()', () => {
		it('transitions step to running and execution to running, adds step to currentSteps', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a', 'step-b'],
			});

			const state = store.markStepRunning(EXEC_ID, 'step-a');

			expect(state.steps['step-a'].status).toBe('running');
			expect(state.steps['step-a'].startedAt).toBeDefined();
			expect(state.currentSteps).toContain('step-a');
			expect(state.status).toBe('running');
		});

		it('records each sub-step relaunch with its (truncated) feedback', () => {
			store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds: ['step-a'] });
			store.markStepRunning(EXEC_ID, 'step-a');
			store.markStepRunning(EXEC_ID, 'step-a', undefined, 'gate failed: 3 tests red');
			const state = store.markStepRunning(EXEC_ID, 'step-a', undefined, 'x'.repeat(5000));

			const relaunches = state.steps['step-a'].relaunches!;
			expect(relaunches).toHaveLength(2);
			expect(relaunches[0].feedback).toBe('gate failed: 3 tests red');
			expect(relaunches[1].feedback).toHaveLength(2000);
			expect(state.steps['step-a'].attempts).toBe(3);
		});

		it('counts attempts and accumulates the time of earlier attempts', () => {
			store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds: ['step-a'] });
			const first = store.markStepRunning(EXEC_ID, 'step-a');
			expect(first.steps['step-a'].attempts).toBe(1);
			expect(first.steps['step-a'].priorAttemptsMs).toBe(0);

			// Pin the first attempt to 4 minutes so the accumulation is deterministic
			const state = store.read(EXEC_ID);
			state.steps['step-a'].startedAt = '2026-10-18T10:00:00.000Z';
			state.steps['step-a'].completedAt = '2026-10-18T10:04:00.000Z';
			state.steps['step-a'].status = 'failed';
			store.update(EXEC_ID, { steps: state.steps });

			const second = store.markStepRunning(EXEC_ID, 'step-a');
			expect(second.steps['step-a'].attempts).toBe(2);
			expect(second.steps['step-a'].priorAttemptsMs).toBe(240000);
		});

		// A step run again (sub-step restart, retry, loop) must not look like "completed with an
		// error" once it finally succeeds: the previous attempt's failure is not this run's.
		it('clears the previous attempt failure details when the step runs again', () => {
			store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds: ['step-a'] });
			store.markStepRunning(EXEC_ID, 'step-a');
			store.markStepFailed(EXEC_ID, 'step-a', 'boom', 'out', 'err');

			const rerun = store.markStepRunning(EXEC_ID, 'step-a');
			expect(rerun.steps['step-a'].status).toBe('running');
			expect(rerun.steps['step-a'].error).toBeUndefined();
			expect(rerun.steps['step-a'].stdout).toBeUndefined();
			expect(rerun.steps['step-a'].stderr).toBeUndefined();
			expect(rerun.steps['step-a'].completedAt).toBeUndefined();

			const done = store.markStepCompleted(EXEC_ID, 'step-a');
			expect(done.steps['step-a'].error).toBeUndefined();
		});

		// A step settled as "not run" that now runs is no longer skipped.
		it('clears the skipped reason of a step that was settled as not run and now runs', () => {
			store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds: ['step-a'] });
			store.markStepSkipped(EXEC_ID, 'step-a', "not run: sub-step 'x' it depends on did not succeed");

			const rerun = store.markStepRunning(EXEC_ID, 'step-a');

			expect(rerun.steps['step-a'].status).toBe('running');
			expect(rerun.steps['step-a'].skippedReason).toBeUndefined();
		});
	});

	describe('markStepsPending()', () => {
		const create = (stepIds: string[]): void => {
			store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds });
		};

		it('puts a failed, a completed and a skipped step back to a clean pending state', () => {
			create(['failed', 'done', 'skipped']);
			store.markStepRunning(EXEC_ID, 'failed', { sourceId: 'src', workerId: 'wk' });
			store.markStepFailed(EXEC_ID, 'failed', 'boom', 'out', 'err');
			store.markStepRunning(EXEC_ID, 'done');
			store.markStepCompleted(EXEC_ID, 'done');
			store.markStepSkipped(EXEC_ID, 'skipped', 'not run: because');

			const state = store.markStepsPending(EXEC_ID, ['failed', 'done', 'skipped']);

			for (const id of ['failed', 'done', 'skipped']) {
				const step = state.steps[id]!;
				expect(step.status, id).toBe('pending');
				expect(step.skippedReason, id).toBeUndefined();
				expect(step.completedAt, id).toBeUndefined();
				expect(step.startedAt, id).toBeUndefined();
				expect(step.error, id).toBeUndefined();
				expect(step.stdout, id).toBeUndefined();
				expect(step.stderr, id).toBeUndefined();
				expect(step.io, id).toBeUndefined();
			}
			expect(store.read(EXEC_ID).steps['skipped']!.status).toBe('pending');
		});

		it('keeps the attempt history and the provenance, and drops the step from currentSteps', () => {
			create(['a']);
			store.markStepRunning(EXEC_ID, 'a', { sourceId: 'src', workerId: 'wk' }, 'feedback');
			store.markStepFailed(EXEC_ID, 'a', 'boom');
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepCompleted(EXEC_ID, 'a');

			const step = store.markStepsPending(EXEC_ID, ['a']).steps['a']!;

			expect(step.attempts).toBe(2);
			expect(step.relaunches).toHaveLength(1);
			expect(step.sourceId).toBe('src');
			expect(step.workerId).toBe('wk');
			expect(store.read(EXEC_ID).currentSteps).not.toContain('a');
		});

		it('leaves a running step alone: it is in flight and reports itself', () => {
			create(['a', 'b']);
			store.markStepRunning(EXEC_ID, 'a');
			store.markStepSkipped(EXEC_ID, 'b', 'not run');

			const state = store.markStepsPending(EXEC_ID, ['a', 'b']);

			expect(state.steps['a']!.status).toBe('running');
			expect(state.currentSteps).toContain('a');
			expect(state.steps['b']!.status).toBe('pending');
		});

		it('fails loudly, naming the unknown step and the execution, and changes nothing', () => {
			create(['a']);
			store.markStepSkipped(EXEC_ID, 'a', 'not run');

			expect(() => store.markStepsPending(EXEC_ID, ['a', 'ghost'])).toThrow(
				new RegExp(`ghost.*${EXEC_ID}|${EXEC_ID}.*ghost`)
			);
			expect(store.read(EXEC_ID).steps['a']!.status).toBe('completed');
		});
	});

	describe('markStepCompleted()', () => {
		it('marks step completed and removes from currentSteps', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const state = store.markStepCompleted(EXEC_ID, 'step-a');

			expect(state.steps['step-a'].status).toBe('completed');
			expect(state.steps['step-a'].completedAt).toBeDefined();
			expect(state.currentSteps).not.toContain('step-a');
		});

		it('persists meta onto the step when provided (ModelStepMeta shape)', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const meta = {
				model: 'claude-sonnet',
				session_id: 'sess-1',
				session_file: '/tmp/sess-1.jsonl',
				ttft_ms: 150,
				duration_ms: 3000,
				cost: { input_tokens: 10, output_tokens: 20, usd: 0.01 },
			};
			const state = store.markStepCompleted(EXEC_ID, 'step-a', meta);

			expect(state.steps['step-a'].meta).toEqual(meta);
			// Re-read from disk, since markStepCompleted writes before returning.
			expect(store.read(EXEC_ID).steps['step-a'].meta).toEqual(meta);
		});

		it('persists meta onto the step when provided (ScriptStepMeta shape)', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const meta = { duration_ms: 500, exit_code: 0 };
			const state = store.markStepCompleted(EXEC_ID, 'step-a', meta);

			expect(state.steps['step-a'].meta).toEqual(meta);
		});

		it('does not add a meta key when meta is omitted', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const state = store.markStepCompleted(EXEC_ID, 'step-a');

			expect(state.steps['step-a']).not.toHaveProperty('meta');
		});
	});

	describe('markStepFailed()', () => {
		it('marks step failed and removes from currentSteps', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const state = store.markStepFailed(EXEC_ID, 'step-a');

			expect(state.steps['step-a'].status).toBe('failed');
			expect(state.steps['step-a'].completedAt).toBeDefined();
			expect(state.currentSteps).not.toContain('step-a');
		});
	});

	describe('markExecutionCompleted()', () => {
		it('sets status to completed and sets completedAt', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const state = store.markExecutionCompleted(EXEC_ID);

			expect(state.status).toBe('completed');
			expect(state.completedAt).not.toBeNull();
			expect(state.currentSteps).toEqual([]);
		});
	});

	describe('markExecutionFailed()', () => {
		it('sets status to failed and sets completedAt', () => {
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: ['step-a'],
			});
			store.markStepRunning(EXEC_ID, 'step-a');
			const state = store.markExecutionFailed(EXEC_ID);

			expect(state.status).toBe('failed');
			expect(state.completedAt).not.toBeNull();
			expect(state.currentSteps).toEqual([]);
		});
	});

	describe('pruneOldExecutions()', () => {
		it('deletes files older than retainDays', () => {
			const shortRetainStore = new ExecutionStore(tmpDir, 1);

			// Create a fresh execution file (should be kept)
			store.create({
				executionId: EXEC_ID,
				flowFile: 'flow.yaml',
				flowId: 'my-flow',
				stepIds: [],
			});

			// Create an old execution file (should be pruned)
			// Write directly with a startedAt 2 days in the past so the JSON-based prune detects it
			const oldId = 'beef1234';
			const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
			const oldFilePath = path.join(tmpDir, `${oldId}.json`);
			fs.writeFileSync(
				oldFilePath,
				JSON.stringify({
					executionId: oldId,
					flowFile: 'flow.yaml',
					flowId: 'my-flow',
					status: 'completed',
					currentSteps: [],
					startedAt: twoDaysAgo,
					completedAt: twoDaysAgo,
					steps: {},
				}),
				'utf8'
			);

			shortRetainStore.pruneOldExecutions();

			expect(fs.existsSync(path.join(tmpDir, `${EXEC_ID}.json`))).toBe(true);
			expect(fs.existsSync(oldFilePath)).toBe(false);
		});
	});
});

describe('ExecutionStore project fields', () => {
	let tmpDir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-project-'));
		store = new ExecutionStore(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('writes projectId next to projectRoot when both are given', () => {
		const state = store.create({
			executionId: 'pj000001',
			flowFile: 'f.yml',
			flowId: 'f',
			stepIds: ['a'],
			projectId: 'a1b2c3d4',
			projectRoot: '/work/app',
		});
		expect(state).toMatchObject({ projectId: 'a1b2c3d4', projectRoot: '/work/app' });
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'pj000001.json'), 'utf8')) as Record<
			string,
			unknown
		>;
		expect(onDisk).toMatchObject({ projectId: 'a1b2c3d4', projectRoot: '/work/app' });
	});

	it('writes neither field when no project is given', () => {
		const state = store.create({ executionId: 'pj000002', flowFile: 'f.yml', flowId: 'f', stepIds: ['a'] });
		expect(state).not.toHaveProperty('projectId');
		expect(state).not.toHaveProperty('projectRoot');
	});
});
