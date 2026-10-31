import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { writeDaemonLog } from '../../daemon/DaemonLog';
import { clearDaemonStartError, readDaemonStartError } from '../../daemon/DaemonStartError';
import { ExclusiveFileLock } from '../../daemon/ExclusiveFileLock';
import { findLiveDaemon } from '../../daemon/LiveDaemonProbe';
import { buildLauncherScriptName, realSweepDeps, sweepStaleLauncherScripts } from '../../daemon/StaleLauncherScriptSweeper';
import { resolveFlowBashPath } from '../../daemon/WindowsDaemonEnv';
import { buildWindowsDaemonLauncherScript } from '../../daemon/WindowsDaemonLauncherScript';
import { FLOW_BUNDLE_NAME } from '../FlowBundleName';

// violations-suppress-end: ts/no-deep-relative

/**
 * Makes sure a daemon is up: spawns one as a detached background process (like `flow start` does) and waits
 * for its port file to appear -- avoids the WebSocket race condition of the in-process path.
 *
 * Concurrent callers (several `flow run` on a cold machine) are serialised: the first spawns, the others find
 * the daemon it started and return. Without that each one spawned its own daemon and deleted the port file of the
 * one that was already up, so the daemons evicted each other while executions were being accepted.
 *
 * @returns true when this call started the daemon, false when one was already live.
 */
export async function spawnDaemonBackground(daemonDir: string, timeoutMs = 10_000): Promise<boolean> {
	fs.mkdirSync(daemonDir, { recursive: true, mode: 0o700 });
	// A different file from the daemon's own start lock: the daemon being started takes that one while this lock is
	// still held waiting for it.
	const release = await ExclusiveFileLock.acquire(path.join(daemonDir, 'daemon-spawn.lock'), {
		timeoutMs: timeoutMs + 5000,
		purpose: 'start the flow daemon (another flow command is starting it)',
	});
	try {
		if ((await findLiveDaemon(daemonDir)) !== null) {
			return false;
		}
		await launchDaemon(daemonDir, timeoutMs);
		return true;
	} finally {
		release();
	}
}

async function launchDaemon(daemonDir: string, timeoutMs: number): Promise<void> {
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
	}

	// Poll for port file written by the freshly-spawned daemon
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(portFile)) {
			return;
		}
		// Cleared before the spawn: whatever is there now was written by the daemon just started, which is dead.
		const startError = readDaemonStartError(daemonDir);
		if (startError !== null) {
			throw new Error(`The daemon failed to start: ${startError.message}`);
		}
		await new Promise(r => setTimeout(r, 50));
	}
	throw new Error(
		`Daemon did not start within ${timeoutMs}ms (port file not found: ${portFile}) and it recorded no start-up error. ` +
			`Check the daemon log: flow logs (files in ${path.join(daemonDir, 'logs')}).`
	);
}
