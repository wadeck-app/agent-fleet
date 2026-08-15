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
