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
 * Env vars forwarded verbatim to the daemon when present in the caller's own env, beyond
 * FLOW_BASH_PATH (resolved specially above). Add a new var here, not a one-off line below --
 * this list is the second and third time a var the daemon needed turned out silently absent
 * because WScript.Shell.Run dropped it (see PATH, then OPENCODE_CONFIG_OPENAI/_ANTHROPIC in
 * .claude/kb/lessons-learned.md). The daemon forwards these again to its forked workers --
 * see ForkWorkerSource.buildEnv()'s matching list.
 */
const PASSTHROUGH_ENV_VARS = ['PATH', 'OPENCODE_CONFIG_OPENAI', 'OPENCODE_CONFIG_ANTHROPIC'];

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
	for (const name of PASSTHROUGH_ENV_VARS) {
		const value = daemonEnv[name];
		if (value) lines.push(`oShell.Environment("Process")("${name}") = "${value.replace(/"/g, '""')}"`);
	}
	return lines;
}
