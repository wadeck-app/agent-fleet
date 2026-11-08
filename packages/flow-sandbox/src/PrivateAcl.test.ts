import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { type AclCommandRunner, PrivateAcl } from './PrivateAcl';
import { PrivateEnvFile } from './PrivateEnvFile';
import { PrivateSecretFile } from './PrivateSecretFile';
import { eachRow } from './testing/EachRow';

const SID = 'S-1-5-21-111-222-333-1001';

function runnerRecording(
	calls: string[][],
	overrides: { icaclsStatus?: number; whoamiOutput?: string } = {}
): AclCommandRunner {
	return (command, args) => {
		calls.push([command, ...args]);
		if (command.endsWith('whoami.exe')) {
			return { status: 0, stdout: overrides.whoamiOutput ?? `"HOST\\me","${SID}"\r\n`, stderr: '' };
		}
		return {
			status: overrides.icaclsStatus ?? 0,
			stdout: '',
			stderr: overrides.icaclsStatus ? 'Access is denied.' : '',
		};
	};
}

describe('PrivateAcl (command building, any platform)', () => {
	it('on Windows removes inheritance and grants full control to the current user only, for a file and for a directory', async () => {
		await eachRow<[string, 'file' | 'directory', string]>(
			[
				['a file', 'file', `*${SID}:F`],
				['a directory (children inherit)', 'directory', `*${SID}:(OI)(CI)F`],
			],
			(_name, kind, grant) => {
				const calls: string[][] = [];

				PrivateAcl.restrictToCurrentUser('C:\\Temp\\x', kind, {
					platform: 'win32',
					systemRoot: 'C:\\Windows',
					run: runnerRecording(calls),
				});

				expect(calls).toEqual([
					['C:\\Windows\\System32\\whoami.exe', '/user', '/fo', 'csv', '/nh'],
					['C:\\Windows\\System32\\icacls.exe', 'C:\\Temp\\x', '/inheritance:r', '/grant:r', grant],
				]);
			}
		);
	});

	it('does nothing elsewhere than Windows (the 0o600 / 0o700 modes apply there)', () => {
		const calls: string[][] = [];

		PrivateAcl.restrictToCurrentUser('/tmp/x', 'file', { platform: 'linux', run: runnerRecording(calls) });

		expect(calls).toEqual([]);
	});

	it('fails loudly, with what to do, when the ACL cannot be set or the user cannot be identified (no silent fallback)', async () => {
		await eachRow<[string, Parameters<typeof runnerRecording>[1], RegExp]>(
			[
				[
					'icacls refuses',
					{ icaclsStatus: 5 },
					/Cannot restrict .* to the current user[\s\S]*Access is denied[\s\S]*icacls/,
				],
				['whoami prints no SID', { whoamiOutput: 'garbage' }, /Cannot read the SID of the current user/],
			],
			(_name, overrides, expected) =>
				expect(() =>
					PrivateAcl.restrictToCurrentUser('C:\\Temp\\x', 'file', {
						platform: 'win32',
						systemRoot: 'C:\\Windows',
						run: runnerRecording([], overrides),
					})
				).toThrow(expected)
		);
	});
});

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

// The real thing, on the real file system. Windows only: the other platforms are covered by the modes (PrivateSecretFile.test.ts).
describe.runIf(process.platform === 'win32')('PrivateAcl on Windows (real icacls, files created here only)', () => {
	const acl = (target: string): string => {
		const result = spawnSync('icacls', [target], { encoding: 'utf8' });
		if (result.status !== 0) throw new Error(`icacls ${target} failed: ${result.stderr}${result.stdout}`);
		return result.stdout;
	};
	const entries = (output: string, target: string): string[] =>
		output
			.replace(target, '')
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line.includes(':('));

	it('leaves one entry for the current user, nothing inherited, for the secret file and its directory, and the owner can still read and remove them', () => {
		const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-acl-test-'));
		directories.push(temp);

		const secret = PrivateSecretFile.create(temp, 'the-secret');

		const directory = path.dirname(secret.filePath);
		const dirEntries = entries(acl(directory), directory);
		const fileEntries = entries(acl(secret.filePath), secret.filePath);
		for (const found of [dirEntries, fileEntries]) {
			expect(found, found.join(' | ')).toHaveLength(1);
			expect(found[0]).toContain(os.userInfo().username);
			expect(found[0]).not.toContain('(I)');
			expect(found[0]).not.toMatch(/SYSTEM|Administrators|Users|Everyone/i);
		}
		expect(fs.readFileSync(secret.filePath, 'utf8')).toBe('the-secret');
		secret.dispose();
		expect(fs.existsSync(directory)).toBe(false);
	});

	it('does the same for the env file of sbx exec, and does not touch the directory it was given', () => {
		const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-acl-test-'));
		directories.push(temp);
		const before = acl(temp);

		const envFile = PrivateEnvFile.create(temp, { A: '1' });

		const fileEntries = entries(acl(envFile.filePath), envFile.filePath);
		expect(fileEntries).toHaveLength(1);
		expect(fileEntries[0]).not.toContain('(I)');
		expect(acl(temp)).toBe(before);
		envFile.dispose();
	});
});
