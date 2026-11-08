import { execFile } from 'node:child_process';

import { hardenedGit } from './HardenedGit.js';

/**
 * Filter drivers (`filter.<name>.clean|smudge|process` in `.git/config`, selected by `.gitattributes`) are commands that
 * git runs while it hashes or writes files: `git status` runs the clean filter on every file whose stat data is stale.
 * `.gitattributes` and `.git/info/attributes` live in the folder and cannot be overridden, so the only protection of a
 * reading call is to blank the commands of every driver the folder's own configuration declares.
 *
 * The system and global configuration are the user's own (git-lfs lives there) and stay trusted, unless the repository
 * redefines the same driver name.
 */

/** Pure configuration read (executes nothing). `-z` output: `scope NUL key [LF value] NUL` per entry. */
export const FILTER_DRIVER_LISTING_ARGS: readonly string[] = ['config', '--show-scope', '--get-regexp', '-z', '^filter\\.'];

const UNTRUSTED_SCOPES: ReadonlySet<string> = new Set(['local', 'worktree', 'command']);

export class FilterDriverListingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FilterDriverListingError';
	}
}

/**
 * Names of the filter drivers declared by the repository itself. The variable is the last dot segment of the key, the
 * name everything between `filter.` and it (a name may contain dots). Throws {@link FilterDriverListingError} on an entry
 * that cannot be handled, never skips it: running git unhardened would be worse.
 */
export function parseUntrustedFilterDriverNames(output: string): string[] {
	const names = new Set<string>();
	const tokens = output === '' ? [] : output.split('\0');
	// Every entry ends with a NUL, so the last token is empty; the others alternate scope, `key[LF value]`.
	if (tokens.length > 0) tokens.pop();
	if (tokens.length % 2 !== 0) {
		throw new FilterDriverListingError(
			'Unexpected output of "git config --show-scope -z" (a scope or a key is missing). Update git (2.26 or later is required) and retry.'
		);
	}
	for (let index = 0; index < tokens.length; index += 2) {
		const scope = tokens[index];
		const entry = tokens[index + 1];
		const newline = entry.indexOf('\n');
		const key = newline === -1 ? entry : entry.slice(0, newline);
		// A key `filter.<var>` without a name is not a driver: git never reads it.
		const match = /^filter\.(.+)\.([^.]+)$/s.exec(key);
		if (match === null) continue;
		if (!UNTRUSTED_SCOPES.has(scope)) continue;
		const name = match[1];
		if (name.includes('=')) {
			throw new FilterDriverListingError(
				`The filter driver "${name}" declared in the git configuration of the folder has a "=" in its name, which cannot be neutralised. Remove the section [filter "${name}"] from the .git/config of the folder, then retry.`
			);
		}
		names.add(name);
	}
	return [...names];
}

/**
 * `-c` entries that turn the drivers off. An empty command is not run by git (verified); `required=false` stops git from
 * failing the call because a required driver has no command.
 */
export function blankFilterDriverConfig(names: readonly string[]): string[] {
	return names.flatMap(name => [
		`filter.${name}.clean=`,
		`filter.${name}.smudge=`,
		`filter.${name}.process=`,
		`filter.${name}.required=false`,
	]);
}

/** Runs git with the given arguments; resolves with stdout on exit 0 or 1 (1: no entry matches), rejects otherwise. */
export type FilterListingExec = (args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<string>;

const defaultExec: FilterListingExec = (args, { cwd, env }) =>
	new Promise((resolve, reject) => {
		execFile('git', args, { cwd, env, windowsHide: true, timeout: 15_000 }, (error, stdout) => {
			if (error === null) resolve(stdout);
			else if ((error as { code?: unknown }).code === 1) resolve(stdout);
			else reject(error);
		});
	});

/**
 * The `-c` entries (see {@link blankFilterDriverConfig}) to put in front of a reading call that may hash files, in a folder
 * a run may have written. The listing itself runs hardened (reading mode). Throws {@link FilterDriverListingError} with
 * an actionable message when the configuration cannot be read.
 */
export async function neutralizeFilterDrivers(cwd: string, exec: FilterListingExec = defaultExec): Promise<string[]> {
	const { args, env } = hardenedGit(FILTER_DRIVER_LISTING_ARGS, { reading: true });
	let output: string;
	try {
		output = await exec(args, { cwd, env });
	} catch (error) {
		throw new FilterDriverListingError(
			`Could not list the filter drivers declared in the git configuration of "${cwd}" (${error instanceof Error ? error.message : String(error)}), so git was not run there: a filter driver could execute commands on this machine. Check that "git config --list" works in that folder (git 2.26 or later), or repair its .git/config.`
		);
	}
	try {
		return blankFilterDriverConfig(parseUntrustedFilterDriverNames(output));
	} catch (error) {
		if (error instanceof FilterDriverListingError) {
			throw new FilterDriverListingError(`${error.message} (folder: "${cwd}")`);
		}
		throw error;
	}
}
