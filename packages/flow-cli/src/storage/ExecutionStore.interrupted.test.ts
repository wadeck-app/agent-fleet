import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from './ExecutionStore';
import type { ExecutionTransition } from './ExecutionTransition';

describe('ExecutionStore -- interrupted and terminal executions', () => {
	let dir: string;
	let transitions: ExecutionTransition[];
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-interrupted-'));
		transitions = [];
		store = new ExecutionStore(dir, 30, undefined, { onTransition: t => transitions.push(t) });
	});

	afterEach(() => removeTempDirectory(dir));

	describe('reconcileInterruptedExecutions()', () => {
		it('fails a running execution, its running step, and settles pending steps as not run', () => {
			store.create({
				executionId: 'aaaa1111',
				flowFile: 'flows/my.yaml',
				flowId: 'my',
				stepIds: ['a', 'b', 'c'],
			});
			store.markStepRunning('aaaa1111', 'a');
			store.markStepCompleted('aaaa1111', 'a');
			store.markStepRunning('aaaa1111', 'b');
			transitions.length = 0;

			const count = store.reconcileInterruptedExecutions();

			const record = store.read('aaaa1111');
			expect(count).toBe(1);
			expect(record.status).toBe('failed');
			expect(record.completedAt).not.toBeNull();
			expect(record.currentSteps).toEqual([]);
			expect(record.lastError).toContain('interrupted: the daemon restarted while this execution was running');
			expect(record.lastError).toContain('flow run flows/my.yaml');
			expect(record.steps.a?.status).toBe('completed');
			expect(record.steps.b?.status).toBe('failed');
			expect(record.steps.b?.error).toBe(record.lastError);
			expect(record.steps.c?.status).toBe('completed');
			expect(record.steps.c?.skippedReason).toContain('not run');
			expect(record.steps.c?.skippedReason).toContain('interrupted');
		});

		it('also fails a queued execution that never started', () => {
			store.create({ executionId: 'bbbb2222', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });

			expect(store.reconcileInterruptedExecutions()).toBe(1);

			expect(store.read('bbbb2222').status).toBe('failed');
			expect(store.read('bbbb2222').steps.a?.skippedReason).toContain('not run');
		});

		it('publishes exactly one execution-failed transition per reconciled execution', () => {
			store.create({ executionId: 'cccc3333', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });
			store.markStepRunning('cccc3333', 'a');
			transitions.length = 0;

			store.reconcileInterruptedExecutions();

			expect(transitions.map(t => t.kind)).toEqual(['execution-failed']);
			expect(transitions[0]?.state.status).toBe('failed');
		});

		it('leaves finished executions alone and is idempotent', () => {
			store.create({ executionId: 'dddd4444', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });
			store.markStepRunning('dddd4444', 'a');
			store.markStepCompleted('dddd4444', 'a');
			store.markExecutionCompleted('dddd4444');
			store.create({ executionId: 'eeee5555', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });
			store.markStepRunning('eeee5555', 'a');

			expect(store.reconcileInterruptedExecutions()).toBe(1);
			const afterFirst = fs.readFileSync(path.join(dir, 'eeee5555.json'), 'utf8');
			transitions.length = 0;

			expect(store.reconcileInterruptedExecutions()).toBe(0);
			expect(fs.readFileSync(path.join(dir, 'eeee5555.json'), 'utf8')).toBe(afterFirst);
			expect(transitions).toEqual([]);
			expect(store.read('dddd4444').status).toBe('completed');
		});

		it('reports an unreadable record and carries on with the others', () => {
			fs.writeFileSync(path.join(dir, 'ffff6666.json'), '{not json', 'utf8');
			store.create({ executionId: 'gggg7777', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			const count = store.reconcileInterruptedExecutions();

			expect(count).toBe(1);
			expect(String(stderr.mock.calls[0]?.[0])).toContain('ffff6666.json');
			stderr.mockRestore();
		});
	});

	describe('terminal status never leaves a running step', () => {
		it('settles a step left running when the execution is marked failed (shape of 2hhiz5m1)', () => {
			store.create({
				executionId: 'hhhh8888',
				flowFile: 'f.yaml',
				flowId: 'f',
				stepIds: ['build', 'e2e', 'report'],
			});
			store.markStepRunning('hhhh8888', 'build');
			store.markStepFailed('hhhh8888', 'build', 'build broke');
			store.markStepRunning('hhhh8888', 'e2e');

			store.markExecutionFailed('hhhh8888');

			const record = store.read('hhhh8888');
			expect(record.steps.e2e?.status).toBe('failed');
			expect(record.steps.e2e?.error).toBe('build broke');
			expect(record.steps.e2e?.completedAt).toBeDefined();
			expect(record.steps.report?.status).toBe('pending');
			expect(record.currentSteps).toEqual([]);
		});

		it('settles a running step with an explicit reason when the execution completes without an error', () => {
			store.create({ executionId: 'iiii9999', flowFile: 'f.yaml', flowId: 'f', stepIds: ['a'] });
			store.markStepRunning('iiii9999', 'a');

			store.markExecutionCompleted('iiii9999');

			const step = store.read('iiii9999').steps.a;
			expect(step?.status).toBe('failed');
			expect(step?.error).toContain('still running');
		});
	});
});
