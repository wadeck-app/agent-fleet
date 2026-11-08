/**
 * Git run by the host (daemon, CLI, plugins) in a folder a run may have written, for example a pool slot that a sandboxed
 * run mounted read/write and whose `.git/config` or `.git/hooks/*` it edited. Git executes the command named by
 * `core.fsmonitor` on `git status`, and the hooks on checkouts, which would be host code execution.
 *
 * Every host-side git call on such a folder goes through {@link hardenedGit}, in one of two modes:
 * - reading (`status`, `rev-parse`, `log`, `worktree list`, `--version`, probes): fsmonitor and hooks disabled, no optional locks;
 * - mutating (`worktree add/remove`, `clone`, `checkout`, `fetch`, `branch`): only fsmonitor disabled. The hooks of the
 *   user's own repository (git-lfs, husky `post-checkout`) keep running, so a worktree or a clone is created as before.
 *
 * Filter drivers (run when `git status` re-hashes a stale file) cannot be switched off by a fixed `-c`: a reading call
 * that may hash files adds the entries of `neutralizeFilterDrivers` (HardenedGitFilters.ts).
 *
 * Not covered: `core.sshCommand` and `credential.helper` (mutating calls); the user's own git calls (flow script
 * steps) are out of scope.
 */

/** The fsmonitor command is the proven vector: git runs it on `status` and on most commands that refresh the index. */
export const HARDENED_GIT_MUTATING_CONFIG: readonly string[] = ['core.fsmonitor=false'];

/**
 * `-c` entries of a reading call. The hooks path is a device that holds no file, never an empty value: git resolves an
 * empty `core.hooksPath` to `/post-checkout`, the root of the drive.
 */
export const HARDENED_GIT_READING_CONFIG: readonly string[] = [
	...HARDENED_GIT_MUTATING_CONFIG,
	`core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
];

export interface HardenedGitOptions {
	/** The command only reads: hooks are disabled too, and the index lock a running step may need is not taken. */
	reading?: boolean;
	/** Environment of the git process. Defaults to the environment of this process. */
	env?: NodeJS.ProcessEnv;
}

export interface HardenedGitCommand {
	/** Arguments for the `git` executable, hardening flags first. */
	args: string[];
	/** Environment for the `git` process (a copy: the given one is not modified). */
	env: NodeJS.ProcessEnv;
}

/** Builds the arguments and the environment of a git call that works on a repository the run may have written. */
export function hardenedGit(args: readonly string[], options: HardenedGitOptions = {}): HardenedGitCommand {
	const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env) };
	const reading = options.reading === true;
	if (reading) {
		env.GIT_OPTIONAL_LOCKS = '0';
	}
	const config = reading ? HARDENED_GIT_READING_CONFIG : HARDENED_GIT_MUTATING_CONFIG;
	return { args: [...config.flatMap(entry => ['-c', entry]), ...args], env };
}
