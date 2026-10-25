import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

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

export interface CreateTempDirectoryDeps {
	/** Registers the removal; defaults to vitest's `onTestFinished`, which runs even when the test fails. */
	registerCleanup?: (cleanup: () => void) => void;
	remove?: (directory: string) => void;
}

/**
 * Creates a temporary directory under the OS temp dir and removes it when the current test ends, whether it passed or
 * failed. Call it from a test or a `beforeEach`; the directory belongs to that one test. The `<directory>.meta` sibling
 * the workspace code may create next to it is removed too.
 *
 * The single way tests of this repository create a temp directory (enforced by TempDirectoryUsage.test.ts): a creation
 * without a registered removal is what filled the OS temp dir with tens of thousands of leftovers.
 *
 * @param prefix names the directory, so a leftover can be traced to the suite that made it (e.g. `flow-validator-`)
 * @throws when called outside a test or hook (nothing could remove the directory); the directory is removed first
 */
export function createTempDirectory(prefix: string, deps: CreateTempDirectoryDeps = {}): string {
	const registerCleanup = deps.registerCleanup ?? onTestFinished;
	const remove = deps.remove ?? removeTempDirectory;
	const directory = mkdtempSync(join(tmpdir(), prefix));
	try {
		registerCleanup(() => {
			remove(directory);
			// The workspace code keeps its metadata next to a workspace, in `<workspace>.meta`, outside the directory itself.
			remove(`${directory}.meta`);
		});
	} catch (error) {
		rmSync(directory, { recursive: true, force: true });
		throw new Error(
			`createTempDirectory("${prefix}") was called outside a test or a beforeEach/afterEach hook, so nothing could remove the directory. ` +
				`Call it inside the test (or beforeEach) that uses it. Cause: ${(error as Error).message}`,
			{ cause: error }
		);
	}
	return directory;
}
