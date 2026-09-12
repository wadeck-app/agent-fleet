import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DefaultProjectResolver } from './DefaultProjectResolver.js';

// realpathSync resolves the macOS/Windows tmpdir symlink so returned absolute
// paths compare equal to the ones the resolver produces.
const tmp = join(realpathSync(tmpdir()), `project-resolver-test-${Date.now()}`);

beforeEach(() => {
	mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function makeDir(...segments: string[]): string {
	const dir = join(tmp, ...segments);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeFile(dir: string, ...rest: string[]): void {
	const filePath = join(dir, ...rest);
	mkdirSync(join(filePath, '..'), { recursive: true });
	writeFileSync(filePath, 'plugins: {}\n', 'utf8');
}

describe('DefaultProjectResolver - .flow/config.yml marker', () => {
	it('resolves the directory holding .flow/config.yml', () => {
		const root = makeDir('proj');
		writeFile(root, '.flow', 'config.yml');

		const result = new DefaultProjectResolver().resolve(root);

		expect(result.projectRoot).toBe(root);
		expect(result.via).toMatch(/\.flow[/\\]config\.yml/);
	});

	it('walks up from a nested subdirectory to the config file (Q#23)', () => {
		const root = makeDir('proj');
		writeFile(root, '.flow', 'config.yml');
		const nested = makeDir('proj', 'packages', 'deep', 'deeper');

		expect(new DefaultProjectResolver().resolve(nested).projectRoot).toBe(root);
	});

	it('prefers the nearest .flow/config.yml when nested projects exist', () => {
		const outer = makeDir('outer');
		writeFile(outer, '.flow', 'config.yml');
		const inner = makeDir('outer', 'inner');
		writeFile(inner, '.flow', 'config.yml');

		expect(new DefaultProjectResolver().resolve(inner).projectRoot).toBe(inner);
	});

	// D#50: the marker directory doubles as the runtime workspace directory, so a
	// .flow/ containing only workspaces/ is a runtime artifact, not a project root.
	it('does NOT treat a .flow/ directory without config.yml as a project root (D#50)', () => {
		const strayArtifacts = makeDir('artifacts');
		makeDir('artifacts', '.flow', 'workspaces');

		expect(() => new DefaultProjectResolver().resolve(strayArtifacts)).toThrow(/no project root/i);
	});

	it('prefers a real config file over an ancestor that only has .flow/workspaces/ (D#50)', () => {
		const root = makeDir('proj');
		writeFile(root, '.flow', 'config.yml');
		const sub = makeDir('proj', 'sub');
		makeDir('proj', 'sub', '.flow', 'workspaces');

		expect(new DefaultProjectResolver().resolve(sub).projectRoot).toBe(root);
	});
});

describe('DefaultProjectResolver - .git fallback', () => {
	it('falls back to a .git directory root', () => {
		const root = makeDir('repo');
		makeDir('repo', '.git');
		const nested = makeDir('repo', 'src');

		const result = new DefaultProjectResolver().resolve(nested);

		expect(result.projectRoot).toBe(root);
		expect(result.via).toMatch(/\.git/);
	});

	// A git worktree stores a `.git` FILE containing `gitdir: ...`, not a directory.
	it('falls back to a .git FILE (git worktree)', () => {
		const root = makeDir('worktree');
		writeFileSync(join(root, '.git'), 'gitdir: C:/repo/.git/worktrees/wt\n', 'utf8');
		const nested = makeDir('worktree', 'src');

		expect(new DefaultProjectResolver().resolve(nested).projectRoot).toBe(root);
	});

	it('prefers .flow/config.yml over a nearer .git root', () => {
		const outer = makeDir('outer');
		writeFile(outer, '.flow', 'config.yml');
		const inner = makeDir('outer', 'inner');
		makeDir('outer', 'inner', '.git');

		expect(new DefaultProjectResolver().resolve(inner).projectRoot).toBe(outer);
	});
});

describe('DefaultProjectResolver - legacy layout detection (D#49)', () => {
	it('fails with an actionable message for .agent-fleet/flows.yml', () => {
		const root = makeDir('legacy');
		writeFile(root, '.agent-fleet', 'flows.yml');

		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/legacy/i);
		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/\.agent-fleet[/\\]flows\.yml/);
		// The message must name the destination so the user can act on it.
		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/\.flow[/\\]/);
	});

	it('fails with an actionable message for .flows/config.yml', () => {
		const root = makeDir('legacy-flows');
		writeFile(root, '.flows', 'config.yml');

		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/legacy/i);
		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/\.flows[/\\]config\.yml/);
	});

	// The legacy detector must key on config FILES, never on directory presence --
	// otherwise stray .agent-fleet/workspaces/ artifacts trigger it (the D#50 bug class).
	it('ignores a legacy DIRECTORY that holds no legacy config file', () => {
		const root = makeDir('repo');
		makeDir('repo', '.git');
		makeDir('repo', '.agent-fleet', 'workspaces');

		expect(new DefaultProjectResolver().resolve(root).projectRoot).toBe(root);
	});

	it('takes precedence over the .git fallback so the user sees what to move', () => {
		const root = makeDir('legacy-repo');
		makeDir('legacy-repo', '.git');
		writeFile(root, '.agent-fleet', 'flows.yml');

		expect(() => new DefaultProjectResolver().resolve(root)).toThrow(/legacy/i);
	});

	it('is not triggered when a valid .flow/config.yml also exists', () => {
		const root = makeDir('migrated');
		writeFile(root, '.flow', 'config.yml');
		writeFile(root, '.agent-fleet', 'flows.yml');

		expect(new DefaultProjectResolver().resolve(root).projectRoot).toBe(root);
	});
});

describe('DefaultProjectResolver - loud failure (D#40, P-4)', () => {
	it('throws naming the markers it looked for and the directory it started from', () => {
		const orphan = makeDir('orphan');

		let message = '';
		try {
			new DefaultProjectResolver().resolve(orphan);
		} catch (err) {
			message = err instanceof Error ? err.message : String(err);
		}

		expect(message).toMatch(/no project root/i);
		expect(message).toContain('.flow/config.yml');
		expect(message).toContain(orphan);
	});

	it('never silently returns the start directory', () => {
		const orphan = makeDir('orphan2');
		expect(() => new DefaultProjectResolver().resolve(orphan)).toThrow();
	});
});
