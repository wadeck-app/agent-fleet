import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExecutionStore, generateExecutionId } from './ExecutionStore.js';

let tmpDir: string;

beforeEach(() => {
	tmpDir = path.join(os.tmpdir(), `exec-store-test-${crypto.randomUUID()}`);
	fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateExecutionId', () => {
	it('returns 8 alphanumeric characters', () => {
		const id = generateExecutionId();
		expect(id).toMatch(/^[a-z0-9]{8}$/);
	});

	it('generates unique IDs', () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateExecutionId()));
		expect(ids.size).toBe(100);
	});
});

describe('ExecutionStore', () => {
	it('creates and reads execution state', () => {
		const store = new ExecutionStore(tmpDir);
		const state = store.create({
			executionId: 'test1234',
			flowFile: '/flow.yml',
			flowId: 'my-flow',
			stepIds: ['s1', 's2'],
		});
		expect(state.status).toBe('queued');
		expect(Object.keys(state.steps)).toEqual(['s1', 's2']);
		const read = store.read('test1234');
		expect(read.executionId).toBe('test1234');
	});

	it('marks step running', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12345', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		const state = store.markStepRunning('abc12345', 's1');
		expect(state.steps['s1']?.status).toBe('running');
		expect(state.currentSteps).toContain('s1');
		expect(state.status).toBe('running');
	});

	it('marks step completed', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12346', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		store.markStepRunning('abc12346', 's1');
		const state = store.markStepCompleted('abc12346', 's1');
		expect(state.steps['s1']?.status).toBe('completed');
		expect(state.currentSteps).not.toContain('s1');
	});

	it('marks execution completed', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12347', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		const state = store.markExecutionCompleted('abc12347');
		expect(state.status).toBe('completed');
		expect(state.completedAt).not.toBeNull();
	});

	it('marks execution failed', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12348', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		const state = store.markExecutionFailed('abc12348');
		expect(state.status).toBe('failed');
	});

	it('marks step failed', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12349', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		store.markStepRunning('abc12349', 's1');
		const state = store.markStepFailed('abc12349', 's1');
		expect(state.steps['s1']?.status).toBe('failed');
		expect(state.currentSteps).not.toContain('s1');
	});

	it('increments iterations on repeated markStepRunning', () => {
		const store = new ExecutionStore(tmpDir);
		store.create({ executionId: 'abc12350', flowFile: '/f.yml', flowId: 'f', stepIds: ['s1'] });
		store.markStepRunning('abc12350', 's1');
		const state = store.markStepRunning('abc12350', 's1');
		expect(state.steps['s1']?.iterations).toBe(2);
	});

	it('throws Corrupted execution state for non-existent executionId', () => {
		const store = new ExecutionStore(tmpDir);
		expect(() => store.read('aaaabbbb')).toThrow('Corrupted execution state for aaaabbbb');
	});

	describe('executionId validation', () => {
		it('throws for path traversal in executionId on create()', () => {
			const store = new ExecutionStore(tmpDir);
			expect(() => store.create({ executionId: '../evil', flowFile: '/f.yml', flowId: 'f', stepIds: [] })).toThrow(
				'Invalid executionId'
			);
		});

		it('throws for path traversal in executionId on read()', () => {
			const store = new ExecutionStore(tmpDir);
			expect(() => store.read('../evil')).toThrow('Invalid executionId');
		});

		it('accepts valid 8-char alphanumeric id', () => {
			const store = new ExecutionStore(tmpDir);
			expect(() =>
				store.create({ executionId: 'abc12345', flowFile: '/f.yml', flowId: 'f', stepIds: [] })
			).not.toThrow();
		});
	});

	describe('pruneOldExecutions', () => {
		it('removes files older than retainDays', async () => {
			const store = new ExecutionStore(tmpDir, 1);
			store.create({ executionId: 'oldexec1', flowFile: '/f.yml', flowId: 'f', stepIds: [] });

			const filePath = path.join(tmpDir, 'oldexec1.json');
			// Backdate the file by 2 days
			const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
			fs.utimesSync(filePath, twoDaysAgo, twoDaysAgo);

			store.pruneOldExecutions();

			expect(fs.existsSync(filePath)).toBe(false);
		});

		it('keeps files newer than retainDays', () => {
			const store = new ExecutionStore(tmpDir, 30);
			store.create({ executionId: 'newexec1', flowFile: '/f.yml', flowId: 'f', stepIds: [] });

			store.pruneOldExecutions();

			expect(fs.existsSync(path.join(tmpDir, 'newexec1.json'))).toBe(true);
		});

		it('is a no-op for empty directory', () => {
			const store = new ExecutionStore(tmpDir, 1);
			expect(() => store.pruneOldExecutions()).not.toThrow();
		});
	});
});
