import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { SbxBinary } from './SbxBinaryLocator';
import { SbxProcess, type SbxProcessRequest } from './SbxProcess';
import { rejection } from './testing/ExpectedFailures';

// SbxProcess knows nothing about sbx verbs, so it is exercised with small node scripts written per test.

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function script(source: string): SbxBinary {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-process-'));
	directories.push(directory);
	const file = path.join(directory, 'child.mjs');
	fs.writeFileSync(file, source);
	return { command: process.execPath, prefixArgs: [file], displayPath: file };
}

function request(binary: SbxBinary, overrides: Partial<SbxProcessRequest> = {}): SbxProcessRequest {
	return { binary, args: [], env: process.env, timeoutMs: 20_000, ...overrides };
}

describe('SbxProcess', () => {
	it('passes arguments without a shell, so metacharacters stay literal', async () => {
		const binary = script('console.log(JSON.stringify(process.argv.slice(2)));');
		const args = ['a b', '$HOME', '`x`', '"q"', '&&', '*', ''];

		const result = await new SbxProcess().run(request(binary, { args }));

		expect(JSON.parse(result.stdout)).toEqual(args);
	});

	it('returns exit code, stdout and stderr separately', async () => {
		const binary = script('process.stdout.write("out"); process.stderr.write("err"); process.exit(5);');

		expect(await new SbxProcess().run(request(binary))).toEqual({ exitCode: 5, stdout: 'out', stderr: 'err' });
	});

	it('writes string and binary stdin and closes it', async () => {
		const binary = script(
			'let d=""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => process.stdout.write(d.toUpperCase()));'
		);

		const text = await new SbxProcess().run(request(binary, { stdin: 'héllo' }));
		const bytes = await new SbxProcess().run(request(binary, { stdin: new TextEncoder().encode('bytes') }));

		expect(text.stdout).toBe('HÉLLO');
		expect(bytes.stdout).toBe('BYTES');
	});

	it('gives the child no stdin when none is requested', async () => {
		const binary = script('process.stdin.on("end", () => process.stdout.write("ended")); process.stdin.resume();');

		expect((await new SbxProcess().run(request(binary))).stdout).toBe('ended');
	});

	it('decodes a multi-byte character split across two chunks', async () => {
		const binary = script(
			'const b = Buffer.from("a€b", "utf8"); process.stdout.write(b.subarray(0, 2)); setTimeout(() => process.stdout.write(b.subarray(2)), 200);'
		);
		const chunks: string[] = [];

		const result = await new SbxProcess().run(request(binary, { onStdout: chunk => chunks.push(chunk) }));

		expect(result.stdout).toBe('a€b');
		expect(chunks.join('')).toBe('a€b');
		expect(chunks.every(chunk => !chunk.includes('�'))).toBe(true);
	});

	it('survives a child that exits without reading a large stdin', async () => {
		const binary = script('process.exit(0);');

		const result = await new SbxProcess().run(request(binary, { stdin: 'x'.repeat(5_000_000) }));

		expect(result.exitCode).toBe(0);
	});

	it('reports a binary that cannot be started, naming it and the fix', async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-process-'));
		directories.push(directory);
		const notExecutable = path.join(directory, 'sbx-not-runnable.txt');
		fs.writeFileSync(notExecutable, 'plain text');

		const error = await rejection(
			new SbxProcess().run(request({ command: notExecutable, prefixArgs: [], displayPath: notExecutable }))
		);

		expect(error.kind).toBe('binary-missing');
		expect(error.message).toContain(`Cannot start sbx (${notExecutable})`);
		expect(error.message).toContain('set SBX_PATH / the "binaryPath" option');
	});

	it('kills a child that exceeds the time limit', async () => {
		const binary = script('setInterval(() => {}, 1000);');

		const error = await rejection(new SbxProcess().run(request(binary, { timeoutMs: 300, args: ['exec', 'x'] })));

		expect(error.kind).toBe('timeout');
		expect(error.message).toContain('did not finish within 300 ms and was killed');
		expect(error.message).toContain('list the sandboxes before retrying');
	});

	it('kills a child on abort and does not leave a listener behind', async () => {
		// The child announces itself, so the abort happens once it runs (no timer, no race with the spawn).
		const binary = script('process.stdout.write("ready"); setInterval(() => {}, 1000);');
		const controller = new AbortController();

		const pending = new SbxProcess().run(
			request(binary, { signal: controller.signal, onStdout: () => controller.abort() })
		);
		const error = await rejection(pending);

		expect(error.kind).toBe('aborted');
	});

	it('refuses to start when the signal is already aborted', async () => {
		// In a directory the afterEach removes: should the abort check regress, the marker is created and must not leak.
		const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-process-'));
		directories.push(markerDirectory);
		const marker = path.join(markerDirectory, 'marker');
		const binary = script(`import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "ran");`);
		const controller = new AbortController();
		controller.abort();

		const error = await rejection(new SbxProcess().run(request(binary, { signal: controller.signal })));

		expect(error.kind).toBe('aborted');
		expect(fs.existsSync(marker)).toBe(false);
	});
});
