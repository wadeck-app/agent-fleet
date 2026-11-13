import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * T-02-load gate (.claude/threat-model.md): code that loads a third-party module by absolute path or bare package
 * (PluginModuleLoader / loadPlugin) has no production consumer yet. Whoever wires the first one must write the threat
 * note before this list grows.
 */
const ALLOWED_PRODUCTION_FILES: readonly string[] = [
	// The loader itself, and the registry module that instantiates it and re-exports `loadPlugin`.
	'packages/flow-cli/src/config/PluginModuleLoader.ts',
	'packages/flow-cli/src/config/BuiltinPluginRegistry.ts',
];

const LOADER_USE = /\bPluginModuleLoader\b|\bloadPlugin\b/;
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-bundle', 'coverage', '__tests__', 'test-utils']);

/** Repo-relative (forward slash) paths of the production files under `<root>/packages/*\/src` that use the loader. */
function findLoaderUses(root: string): string[] {
	const found: string[] = [];
	const packagesDir = join(root, 'packages');
	for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
		if (pkg.isDirectory()) {
			walk(join(packagesDir, pkg.name, 'src'));
		}
	}
	return found.sort();

	function walk(dir: string): void {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				return;
			}
			throw err;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRECTORIES.has(entry.name)) {
					walk(path);
				}
			} else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
				if (LOADER_USE.test(readFileSync(path, 'utf8'))) {
					found.push(relative(root, path).split(sep).join('/'));
				}
			}
		}
	}
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('T-02-load gate: no production code loads third-party modules by path or package', () => {
	it('only the allowlisted files use PluginModuleLoader / loadPlugin', () => {
		const unlisted = findLoaderUses(REPO_ROOT).filter(file => !ALLOWED_PRODUCTION_FILES.includes(file));

		expect(
			unlisted,
			`Production file(s) ${unlisted.join(', ')} use PluginModuleLoader / loadPlugin, which imports code from an ` +
				`absolute path or a bare package. Before adding them to ALLOWED_PRODUCTION_FILES, write the T-02-load note in ` +
				`.claude/threat-model.md: (1) where the path or package name comes from, (2) who can write that value ` +
				`(user config, flow YAML, a project directory, a remote), (3) what code runs and with which rights ` +
				`(daemon, worker, credentials in reach). Then update the row status.`
		).toEqual([]);
	});

	it('every allowlisted file still exists and uses the loader (a stale entry would hide a future consumer)', () => {
		const used = findLoaderUses(REPO_ROOT);

		expect(ALLOWED_PRODUCTION_FILES.filter(file => !used.includes(file))).toEqual([]);
	});

	describe('the scanner', () => {
		let root: string;
		afterEach(() => rmSync(root, { recursive: true, force: true }));

		function fixture(files: Record<string, string>): string {
			root = mkdtempSync(join(tmpdir(), 'plugin-load-gate-'));
			for (const [path, content] of Object.entries(files)) {
				mkdirSync(dirname(join(root, path)), { recursive: true });
				writeFileSync(join(root, path), content);
			}
			return root;
		}

		it('reports a production file that imports the loader or calls loadPlugin, in any package', () => {
			fixture({
				'packages/a/src/Wire.ts': "import { loadPlugin } from './BuiltinPluginRegistry';\nawait loadPlugin(x);",
				'packages/b/src/deep/Other.ts': "import { PluginModuleLoader } from 'x';",
				'packages/b/src/Clean.ts': 'export const x = 1;',
			});

			expect(findLoaderUses(root)).toEqual(['packages/a/src/Wire.ts', 'packages/b/src/deep/Other.ts']);
		});

		it('ignores tests, test utilities, build output and node_modules', () => {
			fixture({
				'packages/a/src/Wire.test.ts': 'loadPlugin(x)',
				'packages/a/src/test-utils/Helper.ts': 'loadPlugin(x)',
				'packages/a/src/__tests__/Smoke.ts': 'loadPlugin(x)',
				'packages/a/src/node_modules/m/index.js': 'loadPlugin(x)',
				'packages/a/dist/Wire.js': 'loadPlugin(x)',
			});

			expect(findLoaderUses(root)).toEqual([]);
		});

		it('does not match a longer identifier', () => {
			fixture({ 'packages/a/src/Near.ts': 'const loadPlugins = 1; const unloadPluginX = 2;' });

			expect(findLoaderUses(root)).toEqual([]);
		});
	});
});
