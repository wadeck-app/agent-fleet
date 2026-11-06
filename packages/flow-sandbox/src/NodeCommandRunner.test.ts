import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { NodeCommandRunner } from './NodeCommandRunner';
import { rejection } from './testing/ExpectedFailures';

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

/** Writes a script into its own temporary directory and returns its path. */
function script(source: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-runner-'));
	directories.push(directory);
	const file = path.join(directory, 'child.mjs');
	fs.writeFileSync(file, source);
	return file;
}

describe('NodeCommandRunner', () => {
	const runner = new NodeCommandRunner();

	it('returns stdout, stderr and the exit code, and passes arguments and environment through without a shell', async () => {
		const file = script(
			'process.stdout.write(JSON.stringify(process.argv.slice(2)) + "|" + process.env.RUNNER_TEST);' +
				'process.stderr.write("warn");process.exit(3);'
		);

		const result = await runner.run({
			command: process.execPath,
			args: [file, 'a b', '$HOME', '&& echo injected'],
			env: { ...process.env, RUNNER_TEST: 'value' },
			timeoutMs: 20_000,
		});

		expect(result).toEqual({
			exitCode: 3,
			stdout: '["a b","$HOME","&& echo injected"]|value',
			stderr: 'warn',
		});
	});

	it('decodes multi-byte output split across chunks', async () => {
		const file = script('process.stdout.write(Buffer.from("héllo wörld ✓"));');

		const result = await runner.run({ command: process.execPath, args: [file], timeoutMs: 20_000 });

		expect(result.stdout).toBe('héllo wörld ✓');
	});

	it('kills a child that exceeds the time limit and says so', async () => {
		const file = script('setTimeout(() => {}, 60000);');

		const error = await rejection(runner.run({ command: process.execPath, args: [file], timeoutMs: 300 }));

		expect(error.kind).toBe('timeout');
		expect(error.message).toContain('did not finish within 300 ms');
	});

	it('kills a child that writes more than the output cap', async () => {
		const file = script('const chunk = "x".repeat(65536); setInterval(() => process.stdout.write(chunk), 1);');

		const error = await rejection(runner.run({ command: process.execPath, args: [file], timeoutMs: 20_000 }));

		expect(error.kind).toBe('command-failed');
		expect(error.message).toContain('standard output and was killed');
	});

	it('kills a child that floods standard error', async () => {
		const file = script('const chunk = "x".repeat(65536); setInterval(() => process.stderr.write(chunk), 1);');

		const error = await rejection(runner.run({ command: process.execPath, args: [file], timeoutMs: 20_000 }));

		expect(error.kind).toBe('command-failed');
		expect(error.message).toContain('standard error and was killed');
	});

	it('reports a missing executable as binary-missing with the next step', async () => {
		const error = await rejection(
			runner.run({ command: 'flow-sandbox-no-such-binary', args: [], timeoutMs: 20_000 })
		);

		expect(error.kind).toBe('binary-missing');
		expect(error.message).toBe(
			'Cannot find "flow-sandbox-no-such-binary" on the PATH of this process. Install it or give its full path.'
		);
	});

	it('reports a file that is not an executable as command-failed', async () => {
		const file = script('not a program');

		const error = await rejection(runner.run({ command: file, args: [], timeoutMs: 20_000 }));

		expect(error.kind).toBe('command-failed');
		expect(error.message).toContain(`Cannot start "${file}"`);
	});
});
