import { describe, expect, it } from 'vitest';

import { AwsConfigFile } from './AwsConfigFile';
import { failure } from './testing/ExpectedFailures';

const base = {
	aliases: ['claude'],
	region: 'us-east-1',
	scriptPath: '/home/agent/.flow-credentials/credential-process.sh',
};

describe('AwsConfigFile.render', () => {
	it('declares one credential_process profile per alias, separated by a blank line, each passing its own alias to the script', () => {
		expect(AwsConfigFile.render(base)).toBe(
			'[profile claude]\n' +
				'credential_process = /home/agent/.flow-credentials/credential-process.sh claude\n' +
				'region = us-east-1\n'
		);
		expect(AwsConfigFile.render({ ...base, aliases: ['claude', 'codex'], region: 'eu-west-1' })).toBe(
			'[profile claude]\n' +
				'credential_process = /home/agent/.flow-credentials/credential-process.sh claude\n' +
				'region = eu-west-1\n\n' +
				'[profile codex]\n' +
				'credential_process = /home/agent/.flow-credentials/credential-process.sh codex\n' +
				'region = eu-west-1\n'
		);
	});

	it('contains no key material', () => {
		expect(AwsConfigFile.render(base)).not.toMatch(/aws_access_key_id|aws_secret_access_key|aws_session_token/);
	});

	it('refuses an empty or repeated alias list, an alias that breaks the section header, and an invalid region', () => {
		expect(failure(() => AwsConfigFile.render({ ...base, aliases: [] })).message).toBe(
			'An AWS config file needs at least one profile alias.'
		);
		// A repeated alias would let the second section override the first.
		expect(failure(() => AwsConfigFile.render({ ...base, aliases: ['claude', 'claude'] })).message).toContain(
			'Profile aliases must be unique, got: claude, claude'
		);
		expect(failure(() => AwsConfigFile.render({ ...base, aliases: ['a]\n[profile x'] })).message).toContain(
			'Profile alias'
		);
		expect(failure(() => AwsConfigFile.render({ ...base, region: 'nope' })).message).toContain(
			'AWS region "nope" is not valid'
		);
	});

	it('refuses a script path that is not a plain absolute sandbox path', () => {
		for (const scriptPath of ['relative/path.sh', '/path with space.sh', '/p\nq', '', '/p;q']) {
			const error = failure(() => AwsConfigFile.render({ ...base, scriptPath }), JSON.stringify(scriptPath));

			expect(error.kind, scriptPath).toBe('invalid-argument');
			expect(error.message, scriptPath).toContain('must be an absolute sandbox path');
		}
	});
});
