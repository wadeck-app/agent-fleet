import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Finds bash.exe on Windows without relying on the system PATH.
 *
 * WScript.Shell.Run (used to start the daemon) spawns with the system PATH, which does not
 * include Git Bash's MSYS2 directories. A plain 'bash' lookup finds WSL bash first, which
 * starts in 3-6s and cannot access Windows temp-file paths. This function searches PATH,
 * then falls back to the Git for Windows install directories.
 */
export function resolveBashOnWindows(env: Record<string, string>): string {
	// Explicit pin from the environment (set by launcher before PATH is lost).
	const pinned = env['FLOW_BASH_PATH'];
	if (pinned && fs.existsSync(pinned)) return pinned;

	// Known Git for Windows installation paths, in preference order. Checked before the PATH
	// search below: System32 (which carries the WSL bash.exe stub) is on nearly every Windows
	// PATH, so searching PATH first would find WSL before ever reaching Git -- the exact bug
	// this function exists to avoid.
	const knownLocations = [
		'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
		'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
		'C:\\Program Files\\Git\\bin\\bash.exe',
	];
	for (const loc of knownLocations) {
		if (fs.existsSync(loc)) return loc;
	}

	// Search the worker's own PATH for bash.exe -- only reached when Git isn't in any of the
	// well-known locations above (e.g. a custom install path).
	const pathEnv = env['PATH'] ?? '';
	for (const dir of pathEnv.split(path.delimiter)) {
		const candidate = path.join(dir, 'bash.exe');
		if (fs.existsSync(candidate)) return candidate;
	}

	// Last resort: let the OS find it. May resolve to WSL bash.
	return 'bash';
}

/**
 * Returns an env object guaranteed to have an exact-case `PATH` key, if any case variant of it
 * exists at all.
 *
 * On Windows, `process.env` is an internal case-insensitive proxy, but spreading it
 * (`{...process.env}`) yields a plain object whose keys keep whatever casing the OS actually
 * handed this process -- observed in production as `Path`, never `PATH`. MSYS2/Git-for-Windows'
 * bash does a case-SENSITIVE lookup for `PATH` (POSIX semantics); finding no exact match, it
 * silently falls back to its own hardcoded `/usr/bin:/bin`, breaking every script that relies on
 * an npm-installed binary. cmd.exe/PowerShell are unaffected (Windows env lookups are
 * case-insensitive), so this must only be applied before handing an env object to bash.
 *
 * The original-cased key is kept alongside -- some other reader may depend on its exact casing.
 * If an exact-case `PATH` already exists, it is never overwritten by another casing's value.
 */
export function normalizePathKey(env: Record<string, string>): Record<string, string> {
	if (Object.prototype.hasOwnProperty.call(env, 'PATH')) return env;
	const existingKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH');
	if (existingKey === undefined) return env;
	return { ...env, PATH: env[existingKey] };
}

/**
 * Git for Windows' bash is a thin shell: coreutils the shim scripts rely on (sed, dirname,
 * uname, ...) live in `<gitRoot>\usr\bin`, not next to bash.exe's own directory on PATH.
 * The daemon's own PATH (inherited from WScript.Shell.Run) carries neither, so any script
 * invoking an npm-installed POSIX shim fails with "command not found" despite bash itself
 * being found correctly via resolveBashOnWindows above.
 */
function gitRootFromBash(bashExecutable: string): string | null {
	const dir = path.dirname(bashExecutable); // .../usr/bin or .../bin
	const parent = path.dirname(dir);
	return path.basename(parent).toLowerCase() === 'usr' ? path.dirname(parent) : parent;
}

/** Mutates env['PATH'] in place to prepend Git's coreutils dirs, if found and not already present. */
export function ensureGitCoreutilsOnPath(env: Record<string, string>, bashExecutable: string): void {
	const gitRoot = gitRootFromBash(bashExecutable);
	if (!gitRoot) return;
	const existingPath = env['PATH'] ?? '';
	const existingDirs = new Set(existingPath.split(path.delimiter).map(d => d.toLowerCase()));
	const toPrepend = [path.join(gitRoot, 'usr', 'bin'), path.join(gitRoot, 'bin')].filter(
		d => fs.existsSync(d) && !existingDirs.has(d.toLowerCase())
	);
	if (toPrepend.length > 0) {
		env['PATH'] = [...toPrepend, existingPath].filter(Boolean).join(path.delimiter);
	}
}
