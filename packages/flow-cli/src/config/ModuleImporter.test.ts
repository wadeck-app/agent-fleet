import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ModuleImporter } from './ModuleImporter';

describe('ModuleImporter', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'module-importer-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	// A directory with a space and a non-ASCII letter: both must survive the file URL conversion.
	function writePlugin(): string {
		const folder = join(dir, 'with space é');
		mkdirSync(folder);
		const file = join(folder, 'plugin.mjs');
		writeFileSync(file, 'export const answer = 42;\n', 'utf8');
		return file;
	}

	it('imports a module from an absolute path, with a Windows drive letter on this platform', async () => {
		const file = writePlugin();
		if (process.platform === 'win32') {
			expect(file).toMatch(/^[A-Za-z]:[\\/]/);
		}

		const mod = await ModuleImporter.importFile(file);

		expect(mod['answer']).toBe(42);
	});

	it('imports through a file URL: percent-encoded, three slashes, the drive letter kept', () => {
		const url = ModuleImporter.toFileUrl(writePlugin());

		expect(url).toMatch(/^file:\/\/\/(?:[A-Za-z]:\/)?.*with%20space%20/);
	});

	// Characterization, in a REAL node process (vitest rewrites import specifiers, so it hides the problem):
	// Node reads "C:" as a URL scheme, which is why the helper must hand it a file URL.
	it.runIf(process.platform === 'win32')('node refuses a bare drive-letter path but accepts its file URL', () => {
		const file = writePlugin();
		const script = join(dir, 'probe.mjs');
		writeFileSync(
			script,
			[
				"import { pathToFileURL } from 'node:url';",
				'const file = process.argv[2];',
				"const outcome = async (specifier) => import(specifier).then(() => 'ok', (error) => error.code);",
				'console.log(JSON.stringify({ bare: await outcome(file), url: await outcome(pathToFileURL(file).href) }));',
			].join('\n'),
			'utf8'
		);

		const result: unknown = JSON.parse(execFileSync(process.execPath, [script, file], { encoding: 'utf8' }));

		expect(result).toEqual({ bare: 'ERR_UNSUPPORTED_ESM_URL_SCHEME', url: 'ok' });
	});

	it('rejects a relative path before importing anything', async () => {
		await expect(ModuleImporter.importFile('./plugin.mjs')).rejects.toThrow(/absolute/);
	});

	it('propagates the import failure of a file that does not exist', async () => {
		await expect(ModuleImporter.importFile(join(dir, 'missing.mjs'))).rejects.toThrow(/missing\.mjs/);
	});
});
