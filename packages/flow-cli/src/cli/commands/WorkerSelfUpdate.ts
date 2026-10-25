import { UpdateManager } from '@wadeck-app/shared-cli';
import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { cacheFilePath, readCache, readUpdateConfig, semverLte } from '@wadeck-app/shared-updater';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FLOW_BUNDLE_NAME } from '../FlowBundleName.js';
import { VERSION } from '../version.js';
// violations-suppress-end: ts/no-deep-relative
import { report } from './WorkerReport';

/**
 * Mutable busy flag shared between step execution and the self-update timer (see `runWorker`).
 *
 * Set to `true`/`false` only around the `adapter.execute()` call in `handleWorkerMessage`'s
 * `'assign'` case -- that is the sole place a worker is actually doing anything that a
 * self re-exec must wait out.
 */
export interface BusyTracker {
	busy: boolean;
	/**
	 * Called once, right after `busy` flips back to `false` -- lets a version bump detected
	 * mid-step act the moment the step finishes, instead of waiting for the next periodic
	 * check (which could be minutes away).
	 */
	onIdle: () => void;
}

/**
 * Explicit CLI args to relaunch this worker with the exact same identity it was started
 * with (Part 2 of worker auto-update, see WorkerSelfUpdate's self re-exec).
 *
 * Built from the already-resolved values at the top of `runWorker` rather than left to be
 * re-derived from environment variables on the new process: `FLOW_WORKER_TOKEN`/
 * `FLOW_WORKER_SOURCE_ID`/`FLOW_WORKER_PROJECTS` could have been rotated or cleared between
 * the two processes, and a respawned worker silently joining under a different identity
 * would be far harder to notice than a worker that fails to start at all.
 */
export function buildReExecArgs(params: {
	sourceId: string | undefined;
	token: string;
	extraProjects: string[];
	labels: string[];
	verbose: boolean;
	interactive: boolean;
}): string[] {
	const args: string[] = [];
	if (params.sourceId !== undefined) {
		args.push('--source', params.sourceId);
	}
	args.push('--token', params.token);
	for (const project of params.extraProjects) args.push('--project', project);
	if (params.labels.length > 0) {
		args.push('--labels', params.labels.join(','));
	}
	if (params.verbose) {
		args.push('--verbose');
	}
	if (params.interactive) {
		args.push('--interactive');
	}
	return args;
}

/**
 * How long a self re-exec'd replacement worker must stay up (no `error`/`exit` on its child
 * handle) before the old process commits to exiting.
 *
 * Not a liveness/registration check -- just long enough to catch the common failure mode of
 * a build that cannot even start (a module resolution error, a syntax error in a freshly
 * bundled file, an uncaught exception during argument parsing). A replacement that passes
 * this and later fails to connect/register is a different, already-handled case (D#51: it
 * retries on its own backoff).
 */
const REEXEC_HEALTH_CHECK_MS = 3_000;

/**
 * Whether a cached `latestVersion` should trigger this worker's self re-exec.
 *
 * `lastHandledVersion` is what makes repeated calls idempotent: without it, every periodic
 * check after the first one to see the same cached `latestVersion` would re-trigger the
 * same re-exec attempt. Version comparison is delegated to `semverLte` (shared-updater) --
 * it already handles both this project's calver scheme and plain semver, so it is reused
 * rather than re-implemented here.
 */
export function isNewerVersionAvailable(
	currentVersion: string,
	latestVersion: string | null,
	lastHandledVersion: string | undefined
): boolean {
	if (latestVersion === null || latestVersion === lastHandledVersion) {
		return false;
	}
	return !semverLte(latestVersion, currentVersion);
}

/** Identity a re-exec'd worker must be relaunched with: see {@link buildReExecArgs}. */
export interface WorkerSelfUpdateIdentity {
	daemonDir: string;
	sourceId: string | undefined;
	token: string;
	extraProjects: string[];
	labels: string[];
	verbose: boolean;
	interactive: boolean;
}

/**
 * Periodic self-check + self re-exec (worker auto-update, Part 2).
 *
 * This worker is long-lived (D#51) and never restarted by anything else, so it is
 * responsible for noticing its own staleness. Background update checks/downloads are
 * re-triggered on the same cadence `flow`'s own CLI commands use (readUpdateConfig's
 * checkIntervalMs); once a newer build lands on disk (UpdateManager's cache file), this
 * process relaunches itself with the exact args it was started with and exits cleanly so
 * the daemon sees an ordinary disconnect, not a crash.
 */
export class WorkerSelfUpdate {
	readonly busyTracker: BusyTracker = {
		busy: false,
		// A version bump noticed while a step is running must not interrupt it; this fires the
		// moment handleWorkerMessage's 'assign' case flips `busy` back to false, instead of
		// waiting for the next periodic tick (which could be minutes away).
		onIdle: () => this.maybeReExec(),
	};

	private lastHandledVersion: string | undefined;
	private pendingReExec = false;
	private timer: NodeJS.Timeout | undefined;
	private cleanup: (() => void) | undefined;

	constructor(private readonly identity: WorkerSelfUpdateIdentity) {}

	/**
	 * Arms the periodic timer. `cleanup` is run right before the process exits after a
	 * successful re-exec (it releases the registry entry / nudge server).
	 */
	start(cleanup: () => void): void {
		this.cleanup = cleanup;
		const bundlePath = resolveOwnBundlePath(FLOW_BUNDLE_NAME, fileURLToPath(import.meta.url));
		const updateConfig = readUpdateConfig(this.identity.daemonDir);
		// Re-arming at exactly checkIntervalMs used to beat against shared-updater's own
		// cache.lastCheckedAt gate (same threshold, so the check finishing a few seconds after each
		// tick made the next tick land a hair short of the gate -- it skipped every other tick,
		// silently halving the real cadence). UPDATER_SKIP_THROTTLE tells the spawned updater this
		// caller already owns its schedule, so the gate is not needed on top of it.
		process.env['UPDATER_SKIP_THROTTLE'] = '1';
		const updateManager = new UpdateManager('@wadeck-app/flow-cli');
		this.timer = setInterval(() => {
			// Has its own locking; safe to call on every tick even if a previous download is
			// still in flight or just finished.
			// VERSION lets shared-cli refuse to spawn for a dev build (no mutating npm install -g from a repo checkout; incident 2026-10-25).
			updateManager.scheduleBackgroundUpdate(bundlePath, 'flow-updater.cjs', VERSION);
			this.checkForNewerVersion();
		}, updateConfig.checkIntervalMs);
		// Never the sole reason this process stays alive: the WS connection, nudge server, and (for
		// an interactive terminal) stdin already do that job, so this timer does not need to.
		this.timer.unref();
	}

	stop(): void {
		clearInterval(this.timer);
	}

	private checkForNewerVersion(): void {
		const cache = readCache(cacheFilePath(this.identity.daemonDir));
		const latestVersion = cache?.latestVersion ?? null;
		if (!isNewerVersionAvailable(VERSION, latestVersion, this.lastHandledVersion)) {
			return;
		}
		// Recorded before busy is even checked: a second tick seeing the same cached version
		// while still busy must not re-arm a second pending re-exec (idempotency).
		this.lastHandledVersion = latestVersion ?? undefined;
		this.pendingReExec = true;
		this.maybeReExec();
	}

	private maybeReExec(): void {
		if (!this.pendingReExec || this.busyTracker.busy) {
			return;
		}
		this.pendingReExec = false;
		this.reExecAndExit();
	}

	private reExecAndExit(): void {
		const scriptPath = process.argv[1];
		if (scriptPath === undefined) {
			// Fail loudly rather than silently skipping the re-exec: a worker that detected an
			// update and then quietly never relaunched would look identical to one with nothing
			// to do, and the operator would have no idea why it never picked up the new build.
			throw new Error(
				'Cannot self re-exec: process.argv[1] is unset. This worker was not launched as a normal "node <script> worker ..." process.'
			);
		}
		const args = buildReExecArgs(this.identity);
		// stdio:'ignore' only -- deliberately NOT detached/windowsHide. Either flag strips the
		// console handle (CREATE_NO_WINDOW / DETACHED_PROCESS), and this respawned worker will
		// itself go on to launch shell/model-CLI subprocesses that AllocConsole() when they find
		// none attached, popping a visible console window (regression fixed multiple times
		// already: d032e7e, b2bca73, d9af4d67). It must inherit this process's console exactly
		// like ForkWorkerSource.obtainWorker() does for daemon-forked workers.
		report('[wait]', `newer version detected -- re-exec'ing to pick it up`);
		// violations-suppress: cli/no-spawn-without-windows-hide windowsHide is deliberately omitted, see the comment above (CREATE_NO_WINDOW strips the console handle)
		const child = spawn(process.execPath, [scriptPath, 'worker', ...args], { stdio: 'ignore' });

		// Does not exit until the replacement has survived REEXEC_HEALTH_CHECK_MS without
		// crashing on startup. Without this, a replacement that fails immediately after spawn
		// (a bad build, a bug only hit at runtime, an environment difference) left this process
		// already dead -- zero live workers, with nothing behind to explain why: the terminal
		// this worker was running in had already exited.
		let settled = false;
		const onEarlyFailure = (detail: unknown): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(healthTimer);
			report(
				'[fail]',
				`re-exec'd replacement failed to start (${String(detail)}) -- staying on the current version instead of leaving no worker running. It will not retry this same version automatically.`
			);
		};
		child.once('error', onEarlyFailure);
		child.once('exit', (code, signal) => onEarlyFailure(`exit code=${String(code)} signal=${String(signal)}`));
		const healthTimer = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			child.removeAllListeners('error');
			child.removeAllListeners('exit');
			child.unref();
			this.cleanup?.();
			process.exit(0);
		}, REEXEC_HEALTH_CHECK_MS);
		healthTimer.unref();
	}
}
