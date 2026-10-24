import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { buildWindowsDaemonEnvLines, resolveFlowBashPath } from '../../daemon/WindowsDaemonEnv';
import { FLOW_BUNDLE_NAME } from '../FlowBundleName';

// violations-suppress-end: ts/no-deep-relative

/**
 * Spawn the daemon as a detached background process (like `flow start` does) and wait
 * for its port file to appear -- avoids the WebSocket race condition of the in-process path.
 */
export async function spawnDaemonBackground(daemonDir: string, timeoutMs = 10_000): Promise<void> {
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

	// Remove stale port file before spawning so the poll below only resolves on a fresh write
	const portFile = path.join(daemonDir, 'config.port');
	try {
		fs.unlinkSync(portFile);
	} catch {
		/* file may not exist */
	}

	if (process.platform === 'win32') {
		const vbsPath = path.join(os.tmpdir(), `flow-daemon-run-${Date.now()}.vbs`);
		const safeNode = process.execPath.replace(/"/g, '""');
		const safeBundle = resolvedBundle.replace(/"/g, '""');
		// Only forward an override we accepted: forwarding a foreign one would hand the daemon a
		// bundle path belonging to another CLI (that is the bug this resolution guards against).
		const overrideLines =
			process.env['LAUNCHER_BUNDLE_OVERRIDE'] === resolvedBundle
				? [
						`oShell.Environment("Process")("LAUNCHER_BUNDLE_OVERRIDE") = "${resolvedBundle.replace(/"/g, '""')}"`,
					]
				: [];
		fs.writeFileSync(
			vbsPath,
			[
				'Dim oShell',
				'Set oShell = CreateObject("WScript.Shell")',
				'oShell.Environment("Process")("FLOW_DAEMON_MODE") = "1"',
				...overrideLines,
				...buildWindowsDaemonEnvLines(daemonEnv),
				`oShell.Run """${safeNode}"" ""${safeBundle}""", 0, False`,
			].join('\r\n')
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
		await new Promise(r => setTimeout(r, 50));
	}
	throw new Error(`Daemon did not start within ${timeoutMs}ms (port file not found: ${portFile})`);
}
