import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VERSION, readBaseVersion } from './version.js';

// Dev fallback (HHmmss-count-hash) or the CI stamp (BBB-hash), which is what the vitest define injects.
const CALVER = /^\d{4}\.\d{2}\.\d{2}-(\d{6}-\d+|\d{3,})-[0-9a-zA-Z]+/;

describe('VERSION', () => {
	it('matches CalVer format YYYY.MM.DD-HHmmss-count-hash', () => {
		expect(VERSION).toMatch(CALVER);
	});
});

// In-process: what mattered was git's behaviour outside a repository, not launching the whole CLI through tsx (a cold
// start that could exceed the 5 s test timeout). `flow --version` through the real entry is covered by
// CliSmoke.integration.test.ts, which also asserts that no "fatal:" line reaches the output.
describe('readBaseVersion -- non-git directory', () => {
	let nonGitDir: string;

	beforeEach(() => {
		nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-version-test-'));
	});

	afterEach(() => {
		fs.rmSync(nonGitDir, { recursive: true, force: true });
	});

	it('falls back to count 0 and hash DEV, and git writes nothing to this process stderr', () => {
		const writes: string[] = [];
		const originalWrite = process.stderr.write;
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;
		let version: string;
		try {
			version = readBaseVersion(nonGitDir);
		} finally {
			process.stderr.write = originalWrite;
		}

		expect(version).toMatch(CALVER);
		expect(version).toMatch(/-0-DEV$/);
		expect(writes.join('')).not.toContain('fatal:');
	});
});
