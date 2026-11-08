/**
 * Every non-test file of flow-engine reaches a process API (`node:child_process`, `execa`, `cross-spawn`,
 * `ProcessTreeKiller`) only through the ProcessLauncher seam, except the files allowlisted below.
 * The per-class `*.launcher.test.ts` files prove one class each; this guard covers the files nobody wrote a test for.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';

const SRC_ROOT = path.resolve(__dirname, '..');

/** Paths relative to `packages/flow-engine/src`, with `/`. Each entry states why it may spawn. */
const ALLOWLIST: Readonly<Record<string, string>> = {
	'processing/DefaultProcessLauncher.ts': 'the host implementation of the seam itself',
	'processing/ProcessTreeKiller.ts': 'taskkill/pgrep implementation behind DefaultProcessLauncher',
	'executor/WindowsProcessCounter.ts':
		'read-only `tasklist` diagnostic of HOST bash/conhost/node leaks for failure messages, runner injectable; counting host processes is its purpose',
	'testing/FlagContractCli.ts': 'test support for the real-CLI flag contract, run on the host only by tests',
	'testing/RealCodexCommand.ts': 'test support locating the real codex.cmd on the host, used only by tests',
};

/**
 * Looks like a real bypass, not a legitimate spawner: kept apart from ALLOWLIST so it stays visible. Remove an entry by
 * fixing the file (use `ProcessLauncher.lookupExecutable`), never by moving it to ALLOWLIST.
 */
const KNOWN_BYPASSES: Readonly<Record<string, string>> = {};

const TOLERATED: Readonly<Record<string, string>> = { ...ALLOWLIST, ...KNOWN_BYPASSES };

function listSourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === 'node_modules' ? [] : listSourceFiles(full);
		}
		return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
	});
}

function relativeToSrc(file: string): string {
	return path.relative(SRC_ROOT, file).split(path.sep).join('/');
}

describe('ProcessLauncher seam -- all flow-engine sources', () => {
	const files = listSourceFiles(SRC_ROOT);

	it('scans a plausible number of files (guards against a wrong root silently scanning nothing)', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it('only allowlisted files use a process API directly', () => {
		const unexpected = files
			.map(file => ({ file: relativeToSrc(file), uses: findDirectProcessApiUses(file) }))
			.filter(({ file, uses }) => uses.length > 0 && TOLERATED[file] === undefined)
			.map(({ file, uses }) => `${file}: ${uses.join(' | ')}`);

		expect(
			unexpected,
			`These files use a process API directly, bypassing the ProcessLauncher seam:\n  - ${unexpected.join('\n  - ')}\n` +
				`How to proceed: take a ProcessLauncher (src/processing/ProcessLauncher.ts) through the constructor and call it ` +
				`instead, with a FakeProcessLauncher test (see ScriptExecutor.launcher.test.ts). Only if the file is itself a ` +
				`launcher or a host-level probe that cannot go through the seam, add it to ALLOWLIST in ` +
				`src/processing/ProcessLauncherSeam.guard.test.ts with the reason.`
		).toEqual([]);
	});

	it('has no stale allowlist entry: each one exists and still uses a process API', () => {
		const stale = Object.keys(TOLERATED).filter(entry => {
			const full = path.join(SRC_ROOT, entry);
			return !fs.existsSync(full) || findDirectProcessApiUses(full).length === 0;
		});
		expect(
			stale,
			`ALLOWLIST entries that no longer exist or no longer spawn: ${stale.join(', ')}. Remove them from ` +
				`src/processing/ProcessLauncherSeam.guard.test.ts so the allowlist does not hide a future bypass.`
		).toEqual([]);
	});
});
