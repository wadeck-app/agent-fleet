import { describe, expect, it } from 'vitest';

import { AwsCredentialError, AwsCredentialExporter } from './AwsCredentialExporter';
import { SandboxError } from './SandboxError';
import { rejectionOf } from './testing/ExpectedFailures';
import { ScriptedCommandRunner } from './testing/ScriptedCommandRunner';

const DOCUMENT = {
	Version: 1,
	AccessKeyId: 'ASIAEXAMPLEKEYID',
	SecretAccessKey: 'example-secret-access-key',
	SessionToken: 'example-session-token',
	Expiration: '2026-10-26T22:00:00Z',
};

function rejection(promise: Promise<unknown>, label?: string): Promise<AwsCredentialError> {
	return rejectionOf(AwsCredentialError, promise, label);
}

function exporterFor(runner: ScriptedCommandRunner, awsCommand?: string): AwsCredentialExporter {
	return new AwsCredentialExporter({ commandRunner: runner, awsCommand, timeoutMs: 1234 });
}

describe('AwsCredentialExporter', () => {
	it('runs the exact export-credentials command without a shell, with the configured aws executable, and returns the document', async () => {
		const runner = new ScriptedCommandRunner([{ exitCode: 0, stdout: JSON.stringify(DOCUMENT), stderr: '' }]);

		const credentials = await exporterFor(runner).export('my host profile');

		expect(runner.requests).toEqual([
			{
				command: 'aws',
				args: ['configure', 'export-credentials', '--profile', 'my host profile', '--format', 'process'],
				timeoutMs: 1234,
			},
		]);
		expect(credentials).toEqual(DOCUMENT);

		const custom = new ScriptedCommandRunner([{ exitCode: 0, stdout: JSON.stringify(DOCUMENT), stderr: '' }]);
		await exporterFor(custom, 'C:\\tools\\aws.exe').export('p');
		expect(custom.requests[0]?.command).toBe('C:\\tools\\aws.exe');
	});

	it('forwards only the documented fields and accepts credentials without a session token', async () => {
		const runner = new ScriptedCommandRunner([
			{
				exitCode: 0,
				stdout: JSON.stringify({
					Version: 1,
					AccessKeyId: 'AKIAEXAMPLE',
					SecretAccessKey: 's',
					Unexpected: 'dropped',
				}),
				stderr: '',
			},
		]);

		const credentials = await exporterFor(runner).export('p');

		expect(credentials).toEqual({ Version: 1, AccessKeyId: 'AKIAEXAMPLE', SecretAccessKey: 's' });
	});

	it('names the profile not found, copying the real AWS CLI 2.31.2 message, with the fix', async () => {
		const runner = new ScriptedCommandRunner([
			{
				exitCode: 253,
				stdout: '',
				// Real output of `aws configure export-credentials --profile no-such-profile-xyz --format process`.
				stderr: 'Unable to retrieve credentials: The config profile (no-such-profile-xyz) could not be found\n\n',
			},
		]);

		const error = await rejection(exporterFor(runner).export('no-such-profile-xyz'));

		expect(error.code).toBe('profile-not-found');
		expect(error.message).toBe(
			'The AWS profile "no-such-profile-xyz" does not exist on the host (Unable to retrieve credentials: The config profile (no-such-profile-xyz) could not be found). ' +
				'List the profiles with "aws configure list-profiles" and fix the "profiles" option that maps aliases to host profiles.'
		);
	});

	it('tells the person to run aws sso login for every expired-session wording, and never logs in itself', async () => {
		// SYNTHETIC stderr texts: the AWS CLI wording for an expired SSO session was not captured on this machine.
		const wordings = [
			'The SSO session associated with this profile has expired or is otherwise invalid.',
			'Error when retrieving token from sso: Token has expired and refresh failed',
			'Error loading SSO Token: Token for https://example.awsapps.com/start does not exist',
		];
		for (const stderr of wordings) {
			const runner = new ScriptedCommandRunner([{ exitCode: 255, stdout: '', stderr }]);

			const error = await rejection(exporterFor(runner).export('claude-host'), stderr);

			expect(error.code, stderr).toBe('sso-expired');
			expect(error.message, stderr).toBe(
				'The AWS SSO session of profile "claude-host" has expired or was never started. ' +
					'Run "aws sso login --profile claude-host" on the host, then retry. The wrapper never logs in by itself.'
			);
			expect(runner.requests, stderr).toHaveLength(1);
		}
	});

	it('quotes the first stderr line of any other failure, and says so when there is no error output', async () => {
		const runner = new ScriptedCommandRunner([
			{ exitCode: 1, stdout: '', stderr: 'Unable to locate credentials\nsecond line' },
		]);

		const error = await rejection(exporterFor(runner).export('p'));

		expect(error.code).toBe('aws-failed');
		expect(error.message).toBe(
			'"aws configure export-credentials --profile p" failed: Unable to locate credentials'
		);

		const silent = new ScriptedCommandRunner([{ exitCode: 1, stdout: '', stderr: '' }]);
		expect((await rejection(exporterFor(silent).export('p'))).message).toContain('(no error output)');
	});

	it('maps a missing aws executable and a timeout to their own codes with the next step, and rethrows an unexpected runner error unchanged', async () => {
		const missing = await rejection(
			exporterFor(new ScriptedCommandRunner([new SandboxError('binary-missing', 'Cannot find "aws"')])).export(
				'p'
			)
		);
		expect(missing.code).toBe('aws-missing');
		expect(missing.message).toContain('Install AWS CLI v2');
		expect(missing.cause).toBeInstanceOf(SandboxError);

		const slow = await rejection(
			exporterFor(new ScriptedCommandRunner([new SandboxError('timeout', 'did not finish')])).export('slow')
		);
		expect(slow.code).toBe('timeout');
		expect(slow.message).toContain('did not finish within 1234 ms');
		expect(slow.message).toContain('aws sso login --profile slow');

		const unexpected = new Error('disk on fire');
		await expect(exporterFor(new ScriptedCommandRunner([unexpected])).export('p')).rejects.toBe(unexpected);
	});

	it('refuses an unusable output without quoting it (it may contain credentials)', async () => {
		const cases: [string, string][] = [
			['text that is not JSON', 'not json at all AKIASECRETLEAK'],
			['JSON null', 'null'],
			['a wrong version', JSON.stringify({ ...DOCUMENT, Version: 2 })],
			['a missing access key', JSON.stringify({ Version: 1, SecretAccessKey: 's' })],
			['an empty secret key', JSON.stringify({ Version: 1, AccessKeyId: 'A', SecretAccessKey: '' })],
		];
		for (const [label, stdout] of cases) {
			const runner = new ScriptedCommandRunner([{ exitCode: 0, stdout, stderr: '' }]);

			const error = await rejection(exporterFor(runner).export('p'), label);

			expect(error.code, label).toBe('aws-output-invalid');
			expect(error.cause, label).toBeUndefined();
			expect(error.message, label).toContain('is not quoted here because it may contain credentials');
			expect(error.message, label).not.toContain('AKIASECRETLEAK');
			expect(error.message, label).not.toContain(DOCUMENT.SecretAccessKey);
		}
	});
});
