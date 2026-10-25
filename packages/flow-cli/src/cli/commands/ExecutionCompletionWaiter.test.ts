import { executionsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExecutionStore } from '../../storage/ExecutionStore';
import { runAfter } from '../../test-utils/WaitHelpers';
import { DaemonStoppedError, ExecutionTimeoutError, waitForCompletion } from './ExecutionCompletionWaiter';

describe('waitForCompletion', () => {
	let daemonDir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-waiter-'));
		fs.mkdirSync(executionsDirOf(daemonDir), { recursive: true });
		store = new ExecutionStore(executionsDirOf(daemonDir));
		store.create({ executionId: 'run1abcd', flowFile: 'f.yml', flowId: 'f', stepIds: ['a'] });
		store.update('run1abcd', { status: 'running' });
	});

	afterEach(() => {
		removeTempDirectory(daemonDir);
	});

	// `flow run --wait` used to poll the execution file until its --timeout (any length the caller chose) even when the
	// daemon that was running it had died: the record then stays "running" until some LATER daemon reconciles it, so the
	// waiter, and the shell wrapper above it, lingered for hours.
	it('stops waiting, with an actionable error, once the daemon that runs the execution is gone', async () => {
		const failure = await waitForCompletion('run1abcd', daemonDir, 60_000, undefined, {
			isDaemonAlive: () => Promise.resolve(false),
			daemonCheckIntervalMs: 20,
		}).then(
			() => undefined,
			(err: unknown) => err
		);

		expect(failure).toBeInstanceOf(DaemonStoppedError);
		expect((failure as Error).message).toContain('run1abcd');
		expect((failure as Error).message).toContain('flow run');
	});

	it('does not give up while the daemon answers', async () => {
		runAfter(150, () => store.markExecutionCompleted('run1abcd'));

		const state = await waitForCompletion('run1abcd', daemonDir, 5_000, undefined, {
			isDaemonAlive: () => Promise.resolve(true),
			daemonCheckIntervalMs: 20,
		});

		expect(state.status).toBe('completed');
	});

	// The daemon idle-stops right after the last execution ends: the result must win over "no daemon".
	it('returns the final state when the daemon is gone but the execution did finish', async () => {
		store.markExecutionCompleted('run1abcd');

		const state = await waitForCompletion('run1abcd', daemonDir, 5_000, undefined, {
			isDaemonAlive: () => Promise.resolve(false),
			daemonCheckIntervalMs: 20,
		});

		expect(state.status).toBe('completed');
	});

	it('still ends with the timeout error when the daemon answers but the execution never finishes', async () => {
		await expect(
			waitForCompletion('run1abcd', daemonDir, 200, undefined, {
				isDaemonAlive: () => Promise.resolve(true),
				daemonCheckIntervalMs: 20,
			})
		).rejects.toBeInstanceOf(ExecutionTimeoutError);
	});

	// A daemon restarting (update, crash recovery) is briefly unreachable: one failed probe is not a verdict.
	it('tolerates a single failed probe', async () => {
		let probes = 0;
		runAfter(250, () => store.markExecutionCompleted('run1abcd'));

		const state = await waitForCompletion('run1abcd', daemonDir, 5_000, undefined, {
			isDaemonAlive: () => Promise.resolve(++probes !== 1),
			daemonCheckIntervalMs: 20,
		});

		expect(state.status).toBe('completed');
	});
});
