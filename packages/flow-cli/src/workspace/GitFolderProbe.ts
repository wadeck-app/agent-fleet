import { type FilterListingExec, hardenedGit, neutralizeFilterDrivers } from 'extension-points';
import { execFile } from 'node:child_process';

import { RUN_META_RELATIVE_DIR } from './RunMetaDir';

export interface GitFolderState {
	/** False when the folder is not inside a git repository, or git is not installed. */
	isRepository: boolean;
	/** True when the repository has uncommitted changes (the metadata of the daemon's own runs excluded). */
	dirty: boolean;
}

/** The part of `execFile` the probe uses (a test seam). */
export type GitExecFile = (
	file: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv; windowsHide: boolean; timeout: number },
	callback: (error: Error | null, stdout: string) => void
) => void;

/**
 * What a workspace provider needs to know about a folder to warn about it. A failed probe is "not a repository", except
 * when the filter drivers of a repository cannot be listed: then it throws a `FilterDriverListingError` (running status
 * without neutralising them could execute a command planted by a previous run).
 *
 * The folder may have been written by a previous (sandboxed) run, so its git configuration is not trusted: every call
 * goes through {@link hardenedGit} (no fsmonitor command, no hooks), and `status` blanks the declared filter drivers.
 */
export class GitFolderProbe {
	constructor(private readonly exec: GitExecFile = execFile as GitExecFile) {}

	/** The listing of the filter drivers goes through the same exec seam (exit 1 of `git config`: nothing matches). */
	private readonly listFilters: FilterListingExec = (args, { cwd, env }) =>
		new Promise((resolve, reject) => {
			this.exec('git', args, { cwd, env, windowsHide: true, timeout: 15_000 }, (error, stdout) => {
				if (error === null || (error as { code?: unknown }).code === 1) resolve(stdout);
				else reject(error);
			});
		});

	async inspect(folder: string): Promise<GitFolderState> {
		if (!(await this.run(folder, ['rev-parse', '--is-inside-work-tree']).then(out => out?.trim() === 'true'))) {
			return { isRepository: false, dirty: false };
		}
		// status re-hashes stale files through the filter drivers the folder declares: blank them first (throws, never runs unhardened).
		const filterConfig = (await neutralizeFilterDrivers(folder, this.listFilters)).flatMap(entry => ['-c', entry]);
		// Optional locks off (hardenedGit "reading"): probing must not take the index lock a running step may need.
		const status = await this.run(folder, [
			...filterConfig,
			'--no-optional-locks',
			'status',
			'--porcelain',
			'--',
			'.',
			`:(exclude)${RUN_META_RELATIVE_DIR.replace(/\\/g, '/')}`,
		]);
		return { isRepository: true, dirty: status !== undefined && status.trim() !== '' };
	}

	private run(cwd: string, gitArgs: string[]): Promise<string | undefined> {
		const { args, env } = hardenedGit(gitArgs, { reading: true });
		return new Promise(resolve => {
			this.exec('git', args, { cwd, env, windowsHide: true, timeout: 15_000 }, (error, stdout) => {
				resolve(error === null ? stdout : undefined);
			});
		});
	}
}
