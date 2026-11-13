import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { writeDaemonLog } from '../../daemon/DaemonLog';
import { DAEMON_START_LOCK_FILE, clearDaemonStartError, readDaemonStartError } from '../../daemon/DaemonStartError';
import { ExclusiveFileLock } from '../../daemon/ExclusiveFileLock';
import { findLiveDaemon } from '../../daemon/LiveDaemonProbe';
import { buildLauncherScriptName, realSweepDeps, sweepStaleLauncherScripts } from '../../daemon/StaleLauncherScriptSweeper';
import { resolveFlowBashPath } from '../../daemon/WindowsDaemonEnv';
import { buildWindowsDaemonLauncherScript } from '../../daemon/WindowsDaemonLauncherScript';
import { isProcessAlive } from '../../utils/isProcessAlive';
import { FLOW_BUNDLE_NAME } from '../FlowBundleName';
import { DAEMON_START_TIMEOUT_ENV, resolveDaemonStartCapMs } from './DaemonStartTimeout';

// violations-suppress-end: ts/no-deep-relative

/**
 * Makes sure a daemon is up: spawns one as a detached background process (like `flow start` does) and waits
 * for its port file to appear -- avoids the WebSocket race condition of the in-process path.
 *
 * Concurrent callers (several `flow run` on a cold machine) are serialised: the first spawns, the others find
 * the daemon it started and return. Without that each one spawned its own daemon and deleted the port file of the
 * one that was already up, so the daemons evicted each other while executions were being accepted.
 *
 * How long it waits: `timeoutMs` (default 10 s) is the grace for a daemon that shows no sign of life; once the daemon's
 * process is seen alive (it holds its start lock) the wait goes on up to the hard cap of {@link resolveDaemonStartCapMs}
 * (60 s, `FLOW_DAEMON_START_TIMEOUT_MS`). A daemon that is gone is reported at once.
 *
 * @returns true when this call started the daemon, false when one was already live.
 * @throws when `FLOW_DAEMON_START_TIMEOUT_MS` is set to something that is not a positive whole number (nothing is spawned).
 */
export async function spawnDaemonBackground(
	daemonDir: string,
	timeoutMs = 10_000,
	deps: DaemonWaitDeps = {}
): Promise<boolean> {
	const capMs = resolveDaemonStartCapMs(deps.env ?? process.env);
	fs.mkdirSync(daemonDir, { recursive: true, mode: 0o700 });
	// A different file from the daemon's own start lock: the daemon being started takes that one while this lock is
	// still held waiting for it. Another caller may hold it for as long as the longest wait.
	const release = await ExclusiveFileLock.acquire(path.join(daemonDir, 'daemon-spawn.lock'), {
		timeoutMs: Math.max(timeoutMs, capMs) + 5000,
		purpose: 'start the flow daemon (another flow command is starting it)',
	});
	try {
		if ((await findLiveDaemon(daemonDir)) !== null) {
			return false;
		}
		await launchDaemon(daemonDir, { graceMs: Math.min(timeoutMs, capMs), capMs: Math.max(timeoutMs, capMs) }, deps);
		return true;
	} finally {
		release();
	}
}

/** Clock, sleep and process check of the wait, replaceable by tests. */
export interface DaemonWaitDeps {
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	isProcessAlive?: (pid: number) => boolean;
	env?: NodeJS.ProcessEnv;
}

interface DaemonWaitLimits {
	/** Without any sign of life from the daemon process. */
	graceMs: number;
	/** Once its process was seen alive. */
	capMs: number;
}

/** What the wait knows about the process it started. */
interface SpawnedDaemon {
	/** Only where the spawned process IS the daemon (not Windows, where it is the wscript wrapper that ends at once). */
	directChild: { pid: number | undefined; exit: () => { code: number | null; signal: NodeJS.Signals | null } | null } | null;
	/** Content of the start lock before the spawn: a lock left by an older, crashed daemon is not this daemon's. */
	lockBefore: string | null;
}

function readStartLock(daemonDir: string): string | null {
	try {
		return fs.readFileSync(path.join(daemonDir, DAEMON_START_LOCK_FILE), 'utf8');
	} catch {
		return null;
	}
}

/** The pid in a start lock written after the spawn, or null (no lock, the old one, or content that names no pid). */
function startLockPid(daemonDir: string, lockBefore: string | null): number | null {
	const content = readStartLock(daemonDir);
	if (content === null || content === lockBefore) {
		return null;
	}
	try {
		const pid = (JSON.parse(content) as { pid?: unknown }).pid;
		return typeof pid === 'number' ? pid : null;
	} catch {
		return null;
	}
}

async function waitForDaemon(
	daemonDir: string,
	limits: DaemonWaitLimits,
	spawned: SpawnedDaemon,
	deps: DaemonWaitDeps
): Promise<void> {
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
	const processAlive = deps.isProcessAlive ?? isProcessAlive;
	const portFile = path.join(daemonDir, 'config.port');
	const logsHint = `Check the daemon log: flow logs (files in ${path.join(daemonDir, 'logs')}).`;
	const startedAt = now();
	let daemonPid: number | null = null;
	for (;;) {
		if (fs.existsSync(portFile)) {
			return;
		}
		// Cleared before the spawn: whatever is there now was written by the daemon just started, which is dead.
		const startError = readDaemonStartError(daemonDir);
		if (startError !== null) {
			throw new Error(`The daemon failed to start: ${startError.message}`);
		}
		const exit = spawned.directChild?.exit() ?? null;
		if (exit !== null) {
			const how = exit.code !== null ? `exit code ${String(exit.code)}` : `signal ${String(exit.signal)}`;
			throw new Error(
				`The daemon process (pid ${String(spawned.directChild?.pid)}) exited (${how}) before publishing its port file ${portFile}, and it recorded no start-up error. ${logsHint}`
			);
		}
		// Sticky: the start lock goes away when the daemon is up, or when it ended and cleaned up.
		daemonPid ??= startLockPid(daemonDir, spawned.lockBefore);
		if (daemonPid !== null && !processAlive(daemonPid)) {
			throw new Error(
				`The daemon process (pid ${String(daemonPid)}) exited before publishing its port file ${portFile}, and it recorded no start-up error. ${logsHint}`
			);
		}
		const elapsed = now() - startedAt;
		const limit = daemonPid === null ? limits.graceMs : limits.capMs;
		if (elapsed >= limit) {
			const which =
				daemonPid === null
					? `no daemon process was seen (none took ${DAEMON_START_LOCK_FILE}) and it recorded no start-up error`
					: `the daemon process is still running (pid ${String(daemonPid)}) but has not published its port file, and it recorded no start-up error. ` +
						`A heavily loaded machine starts slowly: retry, or wait longer with ${DAEMON_START_TIMEOUT_ENV}=<milliseconds> (hard cap now ${String(limits.capMs)} ms)`;
			throw new Error(
				`Daemon did not start within ${String(limit)}ms (elapsed ${String(elapsed)}ms, port file not found: ${portFile}): ${which}. ${logsHint}`
			);
		}
		await sleep(50);
	}
}

async function launchDaemon(daemonDir: string, limits: DaemonWaitLimits, deps: DaemonWaitDeps): Promise<void> {
	// Resolve the .cjs bundle from the launcher override or the installed bundle location
	const resolvedBundle = (() => {
		// In the installed binary, __filename points to the flow.cjs bundle.
		// In dev mode (tsx), we approximate via import.meta.url.
		const self = (() => {
			try {
				return fileURLToPath(import.meta.url).replace(
					/\/cli\/commands\/DaemonBackgroundSpawner\.[jt]s$/,
					'/../../flow.cjs'
				);
			} catch {
				return process.argv[1]!;
			}
		})();
		return resolveOwnBundlePath(FLOW_BUNDLE_NAME, self);
	})();

	// A foreign override must not reach the daemon either: it would resolve its own updater path
	// from another CLI's directory. Pass on the value we accepted, or nothing.
	const daemonEnv: NodeJS.ProcessEnv = { ...process.env, FLOW_DAEMON_MODE: '1' };
	if (daemonEnv['LAUNCHER_BUNDLE_OVERRIDE'] !== resolvedBundle) {
		delete daemonEnv['LAUNCHER_BUNDLE_OVERRIDE'];
	}

	// On Windows the daemon is spawned via VBScript, which loses the Git Bash PATH enrichment
	// (MSYS2 paths like C:\Program Files\Git\usr\bin are absent in the system PATH). Resolve
	// bash.exe now, while we still have the Git Bash PATH, and pass the absolute path so the
	// daemon and its forked workers never depend on PATH lookup for bash.
	if (process.platform === 'win32') {
		const resolved = resolveFlowBashPath(daemonEnv);
		if (resolved) {
			daemonEnv['FLOW_BASH_PATH'] = resolved;
		}
	}

	// Reached only when no daemon answers on the published port, so the file is stale. Removed so the poll below only
	// resolves on a fresh write.
	const portFile = path.join(daemonDir, 'config.port');
	try {
		fs.unlinkSync(portFile);
	} catch {
		/* file may not exist */
	}
	// The reason of an earlier failed start must not be taken for the reason of this one.
	clearDaemonStartError(daemonDir);
	const spawned: SpawnedDaemon = { directChild: null, lockBefore: readStartLock(daemonDir) };

	if (process.platform === 'win32') {
		const tempDirectory = os.tmpdir();
		sweepStaleLauncherScripts(realSweepDeps(tempDirectory));
		const vbsPath = path.join(tempDirectory, buildLauncherScriptName());
		fs.writeFileSync(
			vbsPath,
			buildWindowsDaemonLauncherScript({
				nodePath: process.execPath,
				bundlePath: resolvedBundle,
				// Only forward an override we accepted: forwarding a foreign one would hand the daemon a
				// bundle path belonging to another CLI (that is the bug this resolution guards against).
				forwardedBundleOverride:
					process.env['LAUNCHER_BUNDLE_OVERRIDE'] === resolvedBundle ? resolvedBundle : null,
				daemonEnv,
			}),
			// 'wx': never share nor overwrite a script another launch may be running.
			{ flag: 'wx' }
		);
		// Goes to the daemon log (`flow logs`), not to the console: when a launcher script shows up where it should not
		// (a popup, a leftover), its name leads back to who wrote it and which bundle it starts.
		writeDaemonLog(
			path.join(daemonDir, 'logs'),
			'info',
			`launcher script ${vbsPath} written by pid ${String(process.pid)}, starts bundle ${resolvedBundle}`
		);
		const wscript = spawn('wscript.exe', [vbsPath], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
			env: daemonEnv,
		});
		wscript.unref();
	} else {
		// violations-suppress: cli/no-spawn-without-windows-hide this is the non-Windows branch (win32 uses wscript.exe above), where windowsHide has no effect
		const child = spawn(process.execPath, [resolvedBundle], {
			stdio: 'ignore',
			env: daemonEnv,
		});
		child.unref();
		let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
		child.once('exit', (code, signal) => {
			exit = { code, signal };
		});
		spawned.directChild = { pid: child.pid, exit: () => exit };
	}

	// Poll for the port file written by the freshly-spawned daemon
	await waitForDaemon(daemonDir, limits, spawned, deps);
}
