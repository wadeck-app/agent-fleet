import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findDirectProcessApiUses } from './assertNoDirectProcessApi';

describe('findDirectProcessApiUses', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});

	function sourceFile(content: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-api-guard-'));
		dirs.push(dir);
		const file = path.join(dir, 'Sample.ts');
		fs.writeFileSync(file, content);
		return file;
	}

	it('flags runtime imports of child_process and ProcessTreeKiller', () => {
		const file = sourceFile(
			[
				"import { spawn } from 'node:child_process';",
				"import { type ChildProcess, execSync } from 'node:child_process';",
				"import { killProcessTree } from './ProcessTreeKiller';",
			].join('\n')
		);

		expect(findDirectProcessApiUses(file)).toHaveLength(3);
	});

	it('accepts type-only imports', () => {
		const file = sourceFile(
			[
				"import type { ChildProcess } from 'node:child_process';",
				"import { type ChildProcess as C, type SpawnOptions } from 'node:child_process';",
				"import * as path from 'node:path';",
			].join('\n')
		);

		expect(findDirectProcessApiUses(file)).toEqual([]);
	});

	it.each([
		["const cp = require('child_process');", 'require of child_process'],
		["const { spawn } = require('node:child_process');", 'require of node:child_process'],
		['const cp = require("node:child_process");', 'require with double quotes'],
		["const cp = await import('node:child_process');", 'dynamic import'],
		["const cp = await import(`node:child_process`);", 'dynamic import with backticks'],
		["import('node:child_process').then(cp => cp.spawn('x'));", 'dynamic import with then'],
		["export { spawn } from 'node:child_process';", 'named re-export'],
		["export * from 'node:child_process';", 'star re-export'],
		["export * as cp from 'node:child_process';", 'namespace re-export'],
		["import cp, { type SpawnOptions } from 'node:child_process';", 'default import next to type braces'],
		["import * as cp from 'node:child_process';", 'namespace import'],
		["import { execa } from 'execa';", 'execa import'],
		["const execa = require('execa');", 'execa require'],
		["import spawn from 'cross-spawn';", 'cross-spawn import'],
		["export { killProcessTree } from './ProcessTreeKiller';", 'ProcessTreeKiller re-export'],
		["const k = await import('../processing/ProcessTreeKiller');", 'ProcessTreeKiller dynamic import'],
		["import cp = require('node:child_process');", 'import-equals require'],
	])('flags %s (%s)', source => {
		expect(findDirectProcessApiUses(sourceFile(source))).toHaveLength(1);
	});

	it.each([
		["export type { ChildProcess } from 'node:child_process';", 'type re-export'],
		["export { type ChildProcess } from 'node:child_process';", 'inline type re-export'],
		["onStarted?: (process: import('node:child_process').ChildProcess) => void;", 'import type expression'],
		["const m = await importOriginal<typeof import('node:child_process')>();", 'typeof import'],
		["import type { ChildProcess } from './ProcessTreeKiller';", 'type import of ProcessTreeKiller'],
		["// const cp = require('node:child_process');", 'line comment'],
		["/* import('node:child_process') */", 'block comment'],
		["/**\n * Runs `require('child_process')` never.\n */", 'JSDoc block'],
		["const url = 'http://x/require(\"y\")';", 'unrelated string'],
		["const cp = require('node:path');", 'other module'],
	])('accepts %s (%s)', source => {
		expect(findDirectProcessApiUses(sourceFile(source))).toEqual([]);
	});

	it('throws when the file cannot be read', () => {
		expect(() => findDirectProcessApiUses(path.join(os.tmpdir(), 'does-not-exist-process-api.ts'))).toThrow();
	});
});
