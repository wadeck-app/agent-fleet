import { createDaemonClient } from '@wadeck-app/singleton-daemon-kit';
import type { DaemonHandle } from '@wadeck-app/singleton-daemon-kit';
import { executionsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig';
import { Daemon } from '../daemon/Daemon';
import { SHUTDOWN_GRACE_MS } from '../daemon/DaemonIdleShutdown';
import type { FlowEventPublisher } from '../events/FlowEventPublisher';
import type { DaemonResponse, ExecutionState } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { probeShellCapabilities } from '../worker/WorkerLaunch';

type FlowTestCommands = {
	run: (payload: unknown) => Promise<DaemonResponse>;
	/** Live worker summaries, for `flow worker list` (Q#9). */
	workers?: () => Promise<unknown>;
	/** Resumes an execution kept alive after an unanswered user_intervention timeout. */
	resume?: (payload: unknown) => Promise<DaemonResponse>;
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
	/**
	 * Whether the daemon stops itself once idle. Omitted means no: the test client never restarts a daemon, so a run
	 * sent after the previous one ended (under load, polling lags past the one-second grace) met a stopped server and
	 * failed with ECONNREFUSED. Only a test of the idle stop itself asks for true.
	 */
	stopWhenIdle?: boolean;
	/** Receives the daemon's lifecycle events; omitted means none are published. */
	eventPublisher?: FlowEventPublisher;
}

const LATE_WRITE_QUIET_MS = 300;
/**
 * A daemon allowed to stop itself when idle logs `Daemon stopped (idle)` once its debounce (SHUTDOWN_GRACE_MS) elapses,
 * which can be after the test ended; the quiet period must outlast that debounce.
 */
const IDLE_STOP_QUIET_MS = SHUTDOWN_GRACE_MS + LATE_WRITE_QUIET_MS;
const LATE_WRITE_POLL_MS = 50;
const LATE_WRITE_MAX_MS = 6_000;

/**
 * Removes a stopped test daemon's directory, then waits until nothing recreates it.
 *
 * `stop()` resolves before the worker sockets it closed have been reported: each close then logs a diagnostic line
 * (`writeDaemonLog`, which does `mkdir -p` on `logs/`), so the directory came back holding only
 * `logs/<date>.ndjson` and stayed in the OS temp dir (one `flow-e2e-*` per daemon). The directory is therefore removed
 * again whenever it reappears, until it has stayed absent for a quiet period. Gives up after a bound, loudly.
 */
async function removeDaemonDirectory(daemonDir: string, quietMs: number): Promise<void> {
	removeTempDirectory(daemonDir);
	const deadline = Date.now() + LATE_WRITE_MAX_MS;
	let quietUntil = Date.now() + quietMs;
	while (Date.now() < quietUntil) {
		if (Date.now() > deadline) {
			process.stderr
				.write(`[test cleanup] "${daemonDir}" kept being recreated for ${String(LATE_WRITE_MAX_MS)} ms after the daemon stopped; remove it manually.
`);
			return;
		}
		await new Promise(resolve => setTimeout(resolve, LATE_WRITE_POLL_MS));
		if (fs.existsSync(daemonDir)) {
			removeTempDirectory(daemonDir);
			quietUntil = Date.now() + quietMs;
		}
	}
}

export async function startTestDaemon(options: TestDaemonOptions = {}): Promise<TestDaemonContext> {
	const daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-e2e-'));
	const stopWhenIdle = options.stopWhenIdle ?? false;
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
		handle = await Daemon.start(config, daemonDir, {
			port: 0,
			stopWhenIdle: stopWhenIdle,
			...(options.eventPublisher === undefined ? {} : { eventPublisher: options.eventPublisher }),
		});
	} catch (err) {
		removeTempDirectory(daemonDir);
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
			await removeDaemonDirectory(daemonDir, stopWhenIdle ? IDLE_STOP_QUIET_MS : LATE_WRITE_QUIET_MS);
		},
	};
}

export async function waitForExecution(
	daemonDir: string,
	executionId: string,
	timeoutMs: number
): Promise<ExecutionState> {
	const store = new ExecutionStore(executionsDirOf(daemonDir));
	const deadline = Date.now() + timeoutMs;
	let delay = 200;
	while (Date.now() < deadline) {
		if (store.exists(executionId)) {
			const state = store.read(executionId);
			if (state.status === 'completed' || state.status === 'failed') {
				return state;
			}
		}
		await new Promise(r => setTimeout(r, delay));
		delay = Math.min(delay * 1.5, 2000);
	}
	throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}

/**
 * Whether the test may use bash. Rule: bash is required wherever it is expected to exist, so a
 * missing bash is a failure on Linux/macOS and on any CI runner (`CI` set). Only a local Windows
 * machine without Git for Windows skips, and says so on stderr.
 *
 * @returns true when bash is available; false when the caller must skip (already reported).
 * @throws when bash is missing where it must exist.
 */
export function requireBashOrSkip(testName: string): boolean {
	if (probeShellCapabilities(process.env).includes('bash')) {
		return true;
	}
	if (process.platform !== 'win32' || process.env['CI'] !== undefined) {
		throw new Error(
			`bash was not found on ${process.platform} (CI=${String(process.env['CI'])}) for ${testName}; it must be on PATH here. ` +
				'Install bash or fix PATH -- the test is only skipped on a local Windows machine without Git Bash.'
		);
	}
	process.stderr.write(`SKIPPED ${testName}: no bash on this Windows machine (install Git for Windows).\n`);
	return false;
}
