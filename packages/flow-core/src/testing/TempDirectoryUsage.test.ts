import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { filesUnder } from './AsciiCheck.js';

const PACKAGES_DIR = fileURLToPath(new URL('../../..', import.meta.url));
const SKIPPED_DIRECTORIES = /[\\/](node_modules|dist|dist-bundle|dist-module|dist-types|coverage)[\\/]/;

const CREATION = /\bmkdtemp(?:Sync)?\s*\(/;
// Any of these in the file is a removal: the helper, the dispose/cleanup contract, or an explicit delete.
const REMOVAL =
	/\bcreateTempDirectory\s*\(|\bremoveTempDirectory\s*\(|\brmSync\s*\(|\brm\s*\(|\.cleanup\s*\(|\.dispose\s*\(|asyncDispose/;

/**
 * Lines creating a directory with `mkdtemp`/`mkdtempSync` in a source that never removes anything: the creator whose
 * directories pile up in the OS temp dir. Imports and comment lines are ignored. A file counts as removing when it goes
 * through `createTempDirectory` or contains an explicit removal (`rmSync`, `rm`, `removeTempDirectory`, `cleanup`, `dispose`).
 */
function leakingCreations(source: string): string[] {
	if (REMOVAL.test(source)) {
		return [];
	}
	return source
		.split('\n')
		.map((line, index) => ({ line: line.trim(), number: index + 1 }))
		.filter(({ line }) => CREATION.test(line) && !line.startsWith('import ') && !/^(\/\/|\*|\/\*)/.test(line))
		.map(({ line, number }) => `${number}: ${line}`);
}

describe('leakingCreations', () => {
	it('flags a creation in a file that never removes anything', () => {
		const source =
			"import { mkdtempSync } from 'node:fs';\n\nconst dir = mkdtempSync(join(tmpdir(), 'flow-x-'));\n";

		expect(leakingCreations(source)).toEqual(["3: const dir = mkdtempSync(join(tmpdir(), 'flow-x-'));"]);
	});

	it.each([
		['rmSync', 'afterEach(() => fs.rmSync(dir, { recursive: true }));'],
		['fs.promises rm', 'afterEach(async () => { await rm(dir, { recursive: true }); });'],
		['removeTempDirectory', 'afterEach(() => removeTempDirectory(dir));'],
		['an isolation cleanup()', 'afterEach(() => iso.cleanup());'],
		['an asyncDispose', 'async [Symbol.asyncDispose]() {}'],
		['the helper itself', "const other = createTempDirectory('flow-x-');"],
	])('accepts a file removing through %s', (_label, removal) => {
		const source = `const dir = fs.mkdtempSync(join(tmpdir(), 'flow-x-'));\n${removal}\n`;

		expect(leakingCreations(source)).toEqual([]);
	});

	it('ignores imports and comments mentioning mkdtemp, and files without any creation', () => {
		expect(leakingCreations("import { mkdtempSync } from 'node:fs';\n// mkdtempSync is not used here\n")).toEqual(
			[]
		);
		expect(leakingCreations('const x = 1;\n')).toEqual([]);
	});

	it('does not mistake a longer identifier for a creation', () => {
		expect(leakingCreations("const a = mkdtempSyncLike('x');\nconst b = unmkdtemp('x');\n")).toEqual([]);
	});
});

describe('temp directories of the repository (the real sources)', () => {
	const sources = (): string[] =>
		filesUnder(PACKAGES_DIR).filter(file => /\.(ts|tsx|js|cjs|mjs)$/.test(file) && !SKIPPED_DIRECTORIES.test(file));

	// Why: 112,700 leftovers (flow-validator-test-*, semantic-validator-test-*, flow-e2e-*, flow-test-*) were found in the
	// OS temp dir because creators never removed their directory.
	it('every source creating a directory with mkdtemp also removes it, or goes through createTempDirectory', () => {
		const leaks = sources().flatMap(file =>
			leakingCreations(readFileSync(file, 'utf8')).map(line => `${file}:${line}`)
		);

		expect(
			leaks,
			'\nThese files create a temp directory and never remove it. Use createTempDirectory(prefix) from ' +
				'flow-core/testing (test-utils/helpers in flow-engine), which removes it when the test ends, even on failure:\n' +
				`${leaks.join('\n')}\n`
		).toEqual([]);
	});

	it('scans a non-trivial number of sources, so a wrong layout cannot make the guard pass vacuously', () => {
		expect(sources().length).toBeGreaterThan(500);
	});
});
