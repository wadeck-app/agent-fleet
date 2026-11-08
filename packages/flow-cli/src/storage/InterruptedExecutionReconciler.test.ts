import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
import { InterruptedExecutionReconciler, type ReconcilerHost } from './InterruptedExecutionReconciler';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('InterruptedExecutionReconciler -- work bound at daemon start', () => {
	let dir: string;
	let reads: string[];
	let host: ReconcilerHost;

	function writeRecord(id: string, status: ExecutionState['status'], ageMs: number): void {
		const filePath = path.join(dir, `${id}.json`);
		const state = {
			executionId: id,
			flowFile: 'flows/a.yaml',
			flowId: 'a',
			status,
			currentSteps: [],
			startedAt: new Date().toISOString(),
			completedAt: status === 'running' ? null : new Date().toISOString(),
			steps: {},
		};
		fs.writeFileSync(filePath, JSON.stringify(state), 'utf8');
		const when = new Date(Date.now() - ageMs);
		fs.utimesSync(filePath, when, when);
	}

	function reconciler(): InterruptedExecutionReconciler {
		return new InterruptedExecutionReconciler(dir, host);
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciler-bound-'));
		reads = [];
		host = {
			read: id => {
				reads.push(id);
				return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as ExecutionState;
			},
			write: state => {
				fs.writeFileSync(path.join(dir, `${state.executionId}.json`), JSON.stringify(state), 'utf8');
				return state;
			},
			notify: () => undefined,
			mask: (_id, text) => text,
		};
	});

	afterEach(() => removeTempDirectory(dir));

	it('reads every record the first time (no checkpoint yet), so an old interrupted one is still found', () => {
		writeRecord('old00001', 'running', 10 * DAY_MS);
		writeRecord('done0001', 'completed', 10 * DAY_MS);

		expect(reconciler().reconcile()).toBe(1);
		expect(reads.sort()).toEqual(['done0001', 'old00001']);
	});

	it('does not read a record last written before the previous reconcile', () => {
		writeRecord('done0001', 'completed', 10 * DAY_MS);
		writeRecord('done0002', 'failed', 5 * DAY_MS);
		reconciler().reconcile();
		reads.length = 0;

		expect(reconciler().reconcile()).toBe(0);
		expect(reads).toEqual([]);
	});

	it('still reconciles a record written after the previous reconcile', () => {
		writeRecord('done0001', 'completed', 10 * DAY_MS);
		reconciler().reconcile();
		reads.length = 0;
		writeRecord('live0001', 'running', 0);

		expect(reconciler().reconcile()).toBe(1);
		expect(reads).toEqual(['live0001']);
	});

	it('does not move the checkpoint when the directory cannot be listed', () => {
		const missing = new InterruptedExecutionReconciler(path.join(dir, 'absent'), host);
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		expect(missing.reconcile()).toBe(0);
		expect(fs.existsSync(path.join(dir, 'absent'))).toBe(false);
		stderr.mockRestore();
	});

	describe('executions waiting for a workspace', () => {
		function writeWaiting(id: string, ageMs: number): string {
			const filePath = path.join(dir, `${id}.json`);
			const state = {
				executionId: id,
				flowFile: 'flows/a.yaml',
				flowId: 'a',
				status: 'queued',
				currentSteps: [],
				startedAt: new Date(Date.now() - ageMs).toISOString(),
				completedAt: null,
				steps: { s1: { status: 'pending' } },
				workspaceWait: {
					since: new Date(Date.now() - ageMs).toISOString(),
					message: 'all slots claimed',
					run: {},
				},
			};
			fs.writeFileSync(filePath, JSON.stringify(state), 'utf8');
			const when = new Date(Date.now() - ageMs);
			fs.utimesSync(filePath, when, when);
			return filePath;
		}

		it('does not interrupt a waiting execution (it has done no work) and reports it to be started again', () => {
			writeWaiting('wait0001', 0);
			writeRecord('live0001', 'running', 0);
			const instance = reconciler();

			expect(instance.reconcile()).toBe(1);
			expect(instance.waitingExecutionIds()).toEqual(['wait0001']);
			expect(JSON.parse(fs.readFileSync(path.join(dir, 'wait0001.json'), 'utf8')).status).toBe('queued');
		});

		it('refreshes the file time of a waiting record, so the next start still reads it', () => {
			const filePath = writeWaiting('wait0001', 3 * DAY_MS);

			reconciler().reconcile();

			expect(Date.now() - fs.statSync(filePath).mtimeMs).toBeLessThan(60_000);
			reads.length = 0;
			expect(reconciler().reconcile()).toBe(0);
			expect(reads).toEqual(['wait0001']);
		});

		it('lists nothing when nothing waits', () => {
			writeRecord('done0001', 'completed', 0);
			const instance = reconciler();
			instance.reconcile();

			expect(instance.waitingExecutionIds()).toEqual([]);
		});
	});
});
