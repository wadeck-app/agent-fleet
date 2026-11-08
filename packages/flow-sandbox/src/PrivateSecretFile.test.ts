import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PrivateSecretFile } from './PrivateSecretFile';
import { failure } from './testing/ExpectedFailures';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temp(prefix = 'flow-sandbox-secret-test-'): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	roots.push(directory);
	return directory;
}

describe('PrivateSecretFile', () => {
	it('stores the secret exactly, with no trailing newline, in its own directory under the temp directory', () => {
		const root = temp();

		const file = PrivateSecretFile.create(root, 'abc123');

		expect(fs.readFileSync(file.filePath, 'utf8')).toBe('abc123');
		expect(path.dirname(path.dirname(file.filePath))).toBe(root);
		expect(path.basename(path.dirname(file.filePath))).toMatch(/^flow-sandbox-secret-/);
	});

	it.skipIf(process.platform === 'win32')('is readable by its owner only on POSIX systems', () => {
		const file = PrivateSecretFile.create(temp(), 'abc123');

		expect(fs.statSync(file.filePath).mode & 0o777).toBe(0o600);
		expect(fs.statSync(path.dirname(file.filePath)).mode & 0o077).toBe(0);
	});

	it('removes the file and its directory on dispose, and dispose twice is harmless', () => {
		const file = PrivateSecretFile.create(temp(), 'abc123');
		const directory = path.dirname(file.filePath);

		file.dispose();
		file.dispose();

		expect(fs.existsSync(directory)).toBe(false);
	});

	// sbx runs the value command through cmd.exe on Windows, with the PATH of the process that calls sbx: `cat` is a Git for Windows tool and
	// failed there ("'cat' n'est pas reconnu") once Git's usr/bin was off the PATH; `type` is a cmd built-in and needs backslashes.
	it('builds the command that prints the file without the secret: `type` with backslashes on Windows (no Git needed), `cat` elsewhere', () => {
		const file = PrivateSecretFile.create(temp(), 'super-secret-value');

		const windows = file.valueCommand('win32');
		// A POSIX path for the POSIX rule (this host's temp path is a Windows one).
		const posixFile = Object.create(file, { filePath: { value: '/tmp/flow/secret' } }) as PrivateSecretFile;
		const posix = posixFile.valueCommand('linux');

		expect(windows).toBe(`type "${file.filePath.replace(/\//g, '\\')}"`);
		expect(windows).not.toContain('cat');
		expect(posix).toBe('cat "/tmp/flow/secret"');
		expect(windows).not.toContain('super-secret-value');
		expect(posix).not.toContain('super-secret-value');
	});

	it('refuses a path that cannot be quoted safely: a backslash outside Windows and a shell-special character, naming the allowed characters', () => {
		const file = PrivateSecretFile.create(temp(), 'abc123');
		// A POSIX path never holds a backslash; give the Windows temp path to the POSIX rule to see it refused.
		const withBackslash = Object.create(file, {
			filePath: { value: 'C:\\Temp\\flow\\secret' },
		}) as PrivateSecretFile;

		const backslash = failure(() => withBackslash.valueCommand('linux'));
		expect(backslash.message).toContain('cannot be quoted safely in a shell command');
		expect(withBackslash.valueCommand('win32')).toBe('type "C:\\Temp\\flow\\secret"');

		const dollar = failure(() =>
			PrivateSecretFile.create(temp('flow-sandbox-secret-$test-'), 'abc123').valueCommand('linux')
		);
		const percent = failure(() =>
			PrivateSecretFile.create(temp('flow-sandbox-secret-%PATH%-'), 'abc123').valueCommand('win32')
		);
		expect(percent.message).toContain('cannot be quoted safely in a shell command');
		expect(dollar.kind).toBe('invalid-argument');
		expect(dollar.message).toContain('cannot be quoted safely in a shell command');
		expect(dollar.message).toContain('letters, digits, spaces and . _ - / :');
	});

	it('refuses an empty, multi-line, carriage-return or NUL secret and creates nothing; removes its directory when the write fails', () => {
		const root = temp();
		const cases: [string, string][] = [
			['empty', ''],
			['multi-line', 'a\nb'],
			['with a carriage return', 'a\rb'],
			['with NUL', 'a\0b'],
		];
		for (const [label, secret] of cases) {
			const error = failure(() => PrivateSecretFile.create(root, secret), label);

			expect(error.kind, label).toBe('invalid-argument');
			expect(fs.readdirSync(root), label).toEqual([]);
		}

		const blocker = path.join(root, 'not-a-directory');
		fs.writeFileSync(blocker, 'x');
		expect(() => PrivateSecretFile.create(blocker, 'abc123')).toThrow();
		expect(fs.readdirSync(root)).toEqual(['not-a-directory']);
	});
});
