import { filesUnder, nonAsciiLines } from 'flow-core/testing';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('what the module ships and serves', () => {
	// Project rule: no emoji, check mark, arrow, bullet or ellipsis character in app-module code, strings or comments.
	const shipped = [
		...filesUnder(join(packageDir, 'src')).filter(file => /.(ts|tsx|css|yaml|yml)$/.test(file)),
		join(packageDir, 'manifest.json'),
		join(packageDir, 'README.md'),
	];

	it('finds the files to check (a wrong directory would make the check below vacuous)', () => {
		expect(shipped.length).toBeGreaterThan(10);
	});

	it.each(shipped.map(file => [relative(packageDir, file), file]))('%s holds ASCII only', (_name, file) => {
		expect(nonAsciiLines(file as string), 'replace the character by plain words or three dots').toEqual([]);
	});
});
