import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Incident 2026-10-25: a test spawned the repo-built bundle's `cli update` against the real config dir and
// the real global npm. Any test that spawns the flow bundle must build its env with createIsolatedCliEnv.
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function testFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			return testFiles(full);
		}
		return entry.name.endsWith('.test.ts') ? [full] : [];
	});
}

const SPAWNS_PROCESS = /\b(spawn|spawnSync|fork|execFile|execFileSync|execSync)\(/;
const TARGETS_BUNDLE = /dist-bundle|flow\.cjs|flow-updater\.cjs/;

describe('spawned flow bundles run in an isolated env', () => {
	it('every test that spawns the flow bundle uses createIsolatedCliEnv', () => {
		const offenders = testFiles(srcDir)
			.filter(file => !file.endsWith('IsolatedCliEnv.test.ts') && !file.endsWith('IsolatedCliEnvUsage.test.ts'))
			.filter(file => {
				const content = readFileSync(file, 'utf8');
				return (
					SPAWNS_PROCESS.test(content) &&
					TARGETS_BUNDLE.test(content) &&
					!content.includes('createIsolatedCliEnv')
				);
			})
			.map(file => relative(srcDir, file));
		expect(
			offenders,
			`These tests spawn the flow bundle without createIsolatedCliEnv (src/test-utils/IsolatedCliEnv.ts): ${offenders.join(', ')}`
		).toEqual([]);
	});
});
