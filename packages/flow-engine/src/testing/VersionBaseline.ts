/**
 * VersionBaseline -- the "last CLI version whose mock was confirmed against the real binary" cache.
 *
 * Backs the real-vs-mock integration suites (claude, opencode, codex). The cache lives in
 * `<repo>/.claude/<cli>-version-tested.json` (gitignored): `{ testedVersion, testedAt }`.
 * A suite runs locally when the installed version differs from the cached one, or when forced
 * through an env var, and records the version only AFTER its comparison passed -- so a real
 * incompatibility keeps re-triggering until fixed. It never runs when CI is set.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Walks up from `startDir` to the nearest ancestor containing `.git`.
 *
 * The previous version-tracking attempt resolved its baseline path relative to something other
 * than the actual repo root, so the file was never found, every run read as "no baseline", and
 * the gate treated that as "skip forever" -- three provider flags drifted unnoticed for months.
 * Walking to the real `.git` root instead of hardcoding a relative `../../..` count survives the
 * file moving to a different nesting depth.
 */
export function findRepoRoot(startDir: string): string {
	let dir = startDir;
	while (!existsSync(join(dir, '.git'))) {
		const parent = dirname(dir);
		if (parent === dir) throw new Error(`findRepoRoot: no .git found above ${startDir}`);
		dir = parent;
	}
	return dir;
}

export class VersionBaseline {
	private readonly versionFile: string;

	/**
	 * @param cliName     Used for the file name: `.claude/<cliName>-version-tested.json`.
	 * @param startDir    Any directory inside the repo; the repo root is found from it.
	 * @param forceEnvVar Env var that forces a run regardless of the cache (e.g. CODEX_INTEGRATION).
	 */
	constructor(
		cliName: string,
		startDir: string,
		private readonly forceEnvVar: string
	) {
		this.versionFile = join(findRepoRoot(startDir), '.claude', `${cliName}-version-tested.json`);
	}

	/** The version last confirmed compatible, or null when never recorded / unreadable. */
	public lastTestedVersion(): string | null {
		try {
			const parsed = JSON.parse(readFileSync(this.versionFile, 'utf8'));
			return typeof parsed['testedVersion'] === 'string' ? parsed['testedVersion'] : null;
		} catch {
			return null;
		}
	}

	public recordTestedVersion(version: string): void {
		mkdirSync(dirname(this.versionFile), { recursive: true });
		writeFileSync(
			this.versionFile,
			JSON.stringify({ testedVersion: version, testedAt: new Date().toISOString() }, null, 2)
		);
	}

	/**
	 * True when the suite should run: not in CI, the CLI is installed (`currentVersion` non-null),
	 * and either forced through the env var or the installed version is not the recorded one.
	 */
	public shouldRun(currentVersion: string | null): boolean {
		if (process.env['CI']) return false;
		if (currentVersion === null) return false;
		if (process.env[this.forceEnvVar]) return true;
		return currentVersion !== this.lastTestedVersion();
	}
}
