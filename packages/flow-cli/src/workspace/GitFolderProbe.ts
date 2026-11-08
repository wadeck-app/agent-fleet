import { execFile } from 'node:child_process';

import { RUN_META_RELATIVE_DIR } from './RunMetaDir';

export interface GitFolderState {
	/** False when the folder is not inside a git repository, or git is not installed. */
	isRepository: boolean;
	/** True when the repository has uncommitted changes (the metadata of the daemon's own runs excluded). */
	dirty: boolean;
}

/** What a workspace provider needs to know about a folder to warn about it. Never throws: a failed probe is "not a repository". */
export class GitFolderProbe {
	async inspect(folder: string): Promise<GitFolderState> {
		if (!(await this.run(folder, ['rev-parse', '--is-inside-work-tree']).then(out => out?.trim() === 'true'))) {
			return { isRepository: false, dirty: false };
		}
		// Optional locks off: probing must not take the index lock a running step may need.
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

	private run(cwd: string, args: string[]): Promise<string | undefined> {
		return new Promise(resolve => {
			execFile('git', args, { cwd, windowsHide: true, timeout: 15_000 }, (error, stdout) => {
				resolve(error === null ? stdout : undefined);
			});
		});
	}
}
