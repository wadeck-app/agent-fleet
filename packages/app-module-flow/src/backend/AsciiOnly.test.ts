import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

function filesUnder(directory: string): string[] {
	return readdirSync(directory).flatMap(name => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

const MAX_ASCII_CODE = 127;

function hasNonAscii(line: string): boolean {
	for (let index = 0; index < line.length; index++) {
		if (line.charCodeAt(index) > MAX_ASCII_CODE) {
			return true;
		}
	}
	return false;
}

describe('what the module ships and serves', () => {
	// Project rule: no emoji, check mark, arrow, bullet or ellipsis character in app-module code, strings or comments.
	const shipped = [
		...filesUnder(join(packageDir, 'src')).filter(file => /\.(ts|yaml|yml)$/.test(file)),
		join(packageDir, 'manifest.json'),
		join(packageDir, 'README.md'),
	];

	it('finds the files to check (a wrong directory would make the check below vacuous)', () => {
		expect(shipped.length).toBeGreaterThan(10);
	});

	it.each(shipped.map(file => [relative(packageDir, file), file]))('%s holds ASCII only', (_name, file) => {
		const lines = readFileSync(file as string, 'utf8').split('\n');
		const offending = lines
			.map((line, index) => ({ line, number: index + 1 }))
			.filter(({ line }) => hasNonAscii(line))
			.map(({ line, number }) => `${number}: ${line.trim()}`);
		expect(offending, 'replace the character by plain words or three dots').toEqual([]);
	});
});
