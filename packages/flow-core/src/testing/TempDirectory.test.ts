import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { removeTempDirectory } from './TempDirectory';

function failingWith(code: string): () => void {
	return () => {
		throw Object.assign(new Error(`${code}: simulated`), { code });
	};
}

describe('removeTempDirectory', () => {
	it('removes a directory and its content', () => {
		const dir = mkdtempSync(join(tmpdir(), 'flow-core-tempdir-'));
		writeFileSync(join(dir, 'a.txt'), 'x');

		removeTempDirectory(dir);

		expect(existsSync(dir)).toBe(false);
	});

	it.each(['EPERM', 'EBUSY'])('warns naming the directory and the cause on %s instead of failing', code => {
		const warnings: string[] = [];

		removeTempDirectory('/some/dir', { remove: failingWith(code), warn: message => warnings.push(message) });

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('/some/dir');
		expect(warnings[0]).toContain(code);
	});

	it('throws any other error', () => {
		expect(() => removeTempDirectory('/some/dir', { remove: failingWith('EACCES'), warn: () => {} })).toThrow(
			/EACCES/
		);
	});
});
