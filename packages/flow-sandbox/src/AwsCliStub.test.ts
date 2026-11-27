import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AWS_STUB_VARIABLE, AwsCliStub } from './AwsCliStub';

const directories: string[] = [];

function scriptFile(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-cli-stub-test-'));
	directories.push(directory);
	const file = path.join(directory, 'stub.mjs');
	fs.writeFileSync(file, '');
	return file;
}

afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('AwsCliStub', () => {
	it('keeps the real AWS CLI, silently, when the variable is unset or empty', () => {
		const warnings: string[] = [];
		expect(AwsCliStub.fromEnvironment({}, 'node', m => warnings.push(m))).toBeUndefined();
		expect(AwsCliStub.fromEnvironment({ [AWS_STUB_VARIABLE]: '' }, 'node', m => warnings.push(m))).toBeUndefined();
		expect(warnings).toEqual([]);
	});

	it('runs the script through the given node executable and warns that the AWS CLI is replaced, for tests only', () => {
		const script = scriptFile();
		const warnings: string[] = [];

		const command = AwsCliStub.fromEnvironment({ [AWS_STUB_VARIABLE]: script }, '/usr/bin/node', m =>
			warnings.push(m)
		);

		expect(command).toEqual({ awsCommand: '/usr/bin/node', awsPrefixArguments: [script] });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('WARNING');
		expect(warnings[0]).toContain(AWS_STUB_VARIABLE);
		expect(warnings[0]).toContain('tests only');
	});

	it('fails loudly, naming the variable and the fix, for a path that is relative or missing', () => {
		for (const bad of ['relative/stub.mjs', path.join(os.tmpdir(), 'no-such-dir-aws-stub', 'stub.mjs')]) {
			expect(() => AwsCliStub.fromEnvironment({ [AWS_STUB_VARIABLE]: bad }, 'node', () => undefined)).toThrow(
				new RegExp(`${AWS_STUB_VARIABLE} is set to .*absolute path of an existing script.*unset it`)
			);
		}
	});
});
