import { rmSync } from 'node:fs';

export interface RemoveTempDirectoryDeps {
	remove?: (directory: string) => void;
	warn?: (message: string) => void;
}

/**
 * Removes a test's temporary directory, waiting a bounded 5 x 100 ms for a handle to be released.
 *
 * On Windows a file can stay locked by something outside the test's process tree (observed: no process of ours alive,
 * the lock still held 30 s later while the Windows Search indexer was starting), which makes `rmSync` fail with
 * EPERM/EBUSY after the assertions have already passed. Only those two codes are tolerated, and loudly: the directory
 * and the cause are printed so it can be removed by hand. Any other error is thrown.
 */
export function removeTempDirectory(directory: string, deps: RemoveTempDirectoryDeps = {}): void {
	const remove =
		deps.remove ??
		((target: string) => rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
	const warn = deps.warn ?? ((message: string) => process.stderr.write(`${message}\n`));
	try {
		remove(directory);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== 'EPERM' && code !== 'EBUSY') {
			throw error;
		}
		warn(
			`[test cleanup] could not remove "${directory}" (${code}): a process outside the test still holds a handle on it ` +
				'(antivirus, search indexer or a leftover child). Remove it manually; the test result is not affected.'
		);
	}
}
