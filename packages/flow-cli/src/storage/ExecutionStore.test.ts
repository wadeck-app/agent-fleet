import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore, generateExecutionId } from './ExecutionStore';

describe('generateExecutionId', () => {
	it('generates 8-char alphanumeric IDs', () => {
		const id = generateExecutionId();
		expect(id).toMatch(/^[a-z0-9]{8}$/);
	});

	it('generates unique IDs across multiple calls', () => {
		const ids = new Set(Array.from({ length: 20 }, () => generateExecutionId()));
		expect(ids.size).toBe(20);
	});
});

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
