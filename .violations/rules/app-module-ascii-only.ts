import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type Config = Record<never, never>;

const PACKAGE_ROOT_PATTERN = /^(.*[\\/]packages[\\/](?:app-module-[^\\/]+|flow-core))[\\/]/;
const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/;
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-types', 'dist-module', 'dist-bundle', 'coverage']);

/**
 * App-module packages and flow-core must contain ASCII characters only (code, comments, yaml, json, css).
 * Check marks, ellipsis, em dashes and accented letters have repeatedly leaked into these packages.
 *
 * Test files: the global `globalExclude` of config.ts removes *.test.ts / *.spec.ts before any rule runs,
 * and a rule cannot opt back in. To still cover them, this rule discovers the test files under `src/`
 * of every package it receives a file from, and scans them as well. Limitation: when `violations check --files`
 * is limited to test files only, the runner passes no file to the rule, so tests are not scanned in that run.
 *
 * Suppression: `// violations-suppress: local/app-module-ascii-only reason` on or above the line.
 */
export const rule: Rule<Config> = {
	id: 'local/app-module-ascii-only',
	tags: 'shared',
	defaultScope: [
		'packages/app-module-*/src/**/*.{ts,tsx,yaml,yml,json,css}',
		'packages/app-module-*/manifest.json',
		'packages/app-module-*/README.md',
		'packages/app-module-*/package.json',
		'packages/flow-core/src/**/*.{ts,tsx,yaml,yml,json,css}',
	],
	defaultSeverity: 'error',

	async check(files: string[], _config: Config): Promise<Violation[]> {
		const toScan = new Set<string>(files);
		const packageRoots = new Set<string>();
		for (const file of files) {
			const match = PACKAGE_ROOT_PATTERN.exec(file);
			if (match) {
				packageRoots.add(match[1]!);
			}
		}
		const alreadyListed = new Set(files.map(f => path.normalize(f)));
		for (const packageRoot of packageRoots) {
			for (const testFile of await findTestFiles(path.join(packageRoot, 'src'))) {
				if (!alreadyListed.has(path.normalize(testFile))) {
					toScan.add(testFile);
				}
			}
		}

		const violations: Violation[] = [];
		for (const file of toScan) {
			const source = await fs.readFile(file, 'utf8');
			const lines = source.split(/\r?\n/);
			for (let index = 0; index < lines.length; index++) {
				const found = nonAsciiCharacters(lines[index]!);
				if (found.length === 0) {
					continue;
				}
				violations.push({
					file,
					line: index + 1,
					message:
						`Non-ASCII character(s): ${found.join(', ')}. ` +
						'Use plain ASCII: words like ok/FAIL, "..." instead of the ellipsis character, "-" instead of dashes.',
				});
			}
		}
		return violations;
	},
};

function nonAsciiCharacters(line: string): string[] {
	const found: string[] = [];
	for (const character of line) {
		const codePoint = character.codePointAt(0)!;
		if (codePoint > 0x7f) {
			found.push(`'${character}' (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`);
		}
	}
	return found;
}

async function findTestFiles(directory: string): Promise<string[]> {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}
	const result: string[] = [];
	for (const entry of entries) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORED_DIRECTORIES.has(entry.name)) {
				result.push(...(await findTestFiles(full)));
			}
		} else if (TEST_FILE_PATTERN.test(entry.name)) {
			result.push(full);
		}
	}
	return result;
}

export default rule;
