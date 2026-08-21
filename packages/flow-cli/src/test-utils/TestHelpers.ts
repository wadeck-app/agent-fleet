import { createDaemonClient } from '@wadeck/singleton-daemon-kit';
import type { DaemonHandle } from '@wadeck/singleton-daemon-kit';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Daemon } from '../daemon/Daemon';
import type { DaemonResponse, ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';

type FlowTestCommands = { run: (payload: unknown) => Promise<DaemonResponse> };

export interface TestDaemonContext {
	daemonDir: string;
	client: ReturnType<typeof createDaemonClient<FlowTestCommands>>;
	[Symbol.asyncDispose](): Promise<void>;
}

export async function startTestDaemon(): Promise<TestDaemonContext> {
	const daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-e2e-'));
	let handle: DaemonHandle;
	try {
		handle = await Daemon.start(undefined, daemonDir);
	} catch (err) {
		fs.rmSync(daemonDir, { recursive: true, force: true });
		throw err;
	}

	const client = createDaemonClient<FlowTestCommands>({
		configDir: daemonDir,
		commands: { run: async p => p as DaemonResponse },
	});

	return {
		daemonDir,
		client,
		async [Symbol.asyncDispose](): Promise<void> {
			try {
				await handle.stop('idle');
			} catch {
				/* ignore cleanup errors */
			}
			fs.rmSync(daemonDir, { recursive: true, force: true });
		},
	};
}

export async function waitForExecution(
	daemonDir: string,
	executionId: string,
	timeoutMs: number
): Promise<ExecutionState> {
	const store = new ExecutionStore(path.join(daemonDir, 'executions'));
	const deadline = Date.now() + timeoutMs;
	let delay = 200;
	while (Date.now() < deadline) {
		if (store.exists(executionId)) {
			const state = store.read(executionId);
			if (state.status === 'completed' || state.status === 'failed') return state;
		}
		await new Promise(r => setTimeout(r, delay));
		delay = Math.min(delay * 1.5, 2000);
	}
	throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}
