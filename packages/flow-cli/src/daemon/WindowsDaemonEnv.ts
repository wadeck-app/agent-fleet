import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Resolves the absolute path to Git Bash's bash.exe from the caller's own PATH, before
 * WScript.Shell.Run drops it. Returns undefined when nothing is found, that's not an escape
 * hatch -- the daemon's resolveBashOnWindows() has its own known-location fallback.
 */
export function resolveFlowBashPath(env: NodeJS.ProcessEnv): string | undefined {
	if (env['FLOW_BASH_PATH']) return env['FLOW_BASH_PATH'];
	for (const dir of (env['PATH'] ?? '').split(path.delimiter)) {
		const candidate = path.join(dir, 'bash.exe');
		if (fs.existsSync(candidate)) return candidate;
	}
	return undefined;
}

/**
 * WScript.Shell.Run does not inherit the caller's env; only variables explicitly set via
 * oShell.Environment("Process") reach the spawned daemon. Without the PATH line, the daemon's
 * own process.env.PATH is empty (not merely missing Git) -- every npm-global shim invoked by
 * bare name from a script step (task, flow, ...) is "command not found".
 */
export function buildWindowsDaemonEnvLines(daemonEnv: NodeJS.ProcessEnv): string[] {
	const lines: string[] = [];
	const bashPath = daemonEnv['FLOW_BASH_PATH'];
	if (bashPath) lines.push(`oShell.Environment("Process")("FLOW_BASH_PATH") = "${bashPath.replace(/"/g, '""')}"`);
	const pathValue = daemonEnv['PATH'];
	if (pathValue) lines.push(`oShell.Environment("Process")("PATH") = "${pathValue.replace(/"/g, '""')}"`);
	return lines;
}
