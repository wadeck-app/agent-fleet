import { createDaemonClient } from '@wadeck-app/singleton-daemon-kit';
import type { DaemonHandle } from '@wadeck-app/singleton-daemon-kit';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig';
import { Daemon } from '../daemon/Daemon';
import type { DaemonResponse, ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';

type FlowTestCommands = {
	run: (payload: unknown) => Promise<DaemonResponse>;
	/** Live worker summaries, for `flow worker list` (Q#9). */
	workers?: () => Promise<unknown>;
};

export interface TestDaemonContext {
	daemonDir: string;
	client: ReturnType<typeof createDaemonClient<FlowTestCommands>>;
	[Symbol.asyncDispose](): Promise<void>;
}

export interface TestDaemonOptions {
	/**
	 * Concurrency limit for the test daemon.
	 *
	 * Zero is useful on purpose: it stops the daemon forking workers of its own, so a test
	 * about a *registered* worker cannot silently pass because a forked one did the work.
	 * Admission is unaffected -- an external worker still joins, since the limit governs how
	 * many workers the daemon creates, not who may connect.
	 */
	concurrency?: number;
}

export async function startTestDaemon(options: TestDaemonOptions = {}): Promise<TestDaemonContext> {
	const daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-e2e-'));
	let handle: DaemonHandle;
	try {
		// An ephemeral worker port, because test files run concurrently and the default derives
		// the port from the HTTP one. Two daemons then race for the same number: the loser
		// retries upward onto a neighbour's HTTP port, and its worker's handshake gets a 404.
		// That is exactly the flake this replaces.
		const config: FlowConfig = {
			...FlowConfigLoader.DEFAULT,
			worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 },
			...(options.concurrency !== undefined
				? { queue: { ...FlowConfigLoader.DEFAULT.queue, concurrency: options.concurrency } }
				: {}),
		};
		// Port 0 for the command server too: the standard port is a fixed number shared with
		// the user's own daemon and with every other test daemon, so whoever loses the race
		// publishes a port file nothing is listening on and every client gets ECONNREFUSED.
		handle = await Daemon.start(config, daemonDir, { port: 0 });
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
