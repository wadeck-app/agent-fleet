import { hardenedGit } from 'extension-points';
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
 * What a workspace provider needs to know about a folder to warn about it. Never throws: a failed probe is "not a repository".
 *
 * The folder may have been written by a previous (sandboxed) run, so its git configuration is not trusted: every call
 * goes through {@link hardenedGit} (no fsmonitor command, no hooks).
 */
export class GitFolderProbe {
	constructor(private readonly exec: GitExecFile = execFile as GitExecFile) {}

	async inspect(folder: string): Promise<GitFolderState> {
		if (!(await this.run(folder, ['rev-parse', '--is-inside-work-tree']).then(out => out?.trim() === 'true'))) {
			return { isRepository: false, dirty: false };
		}
		// Optional locks off (hardenedGit "reading"): probing must not take the index lock a running step may need.
		const status = await this.run(folder, [
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
