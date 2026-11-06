import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CREDENTIAL_TOKEN_VARIABLE, CredentialProcessScript } from './CredentialProcessScript';
import { NodeCommandRunner } from './NodeCommandRunner';
import { BashRequirement } from './testing/BashRequirement';
import { failure } from './testing/ExpectedFailures';

const roots: string[] = [];

// Several tests run a real bash: a machine without it must fail with the reason, not skip.
beforeAll(() => BashRequirement.assertAvailable());

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temp(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-script-'));
	roots.push(directory);
	return directory;
}

describe('CredentialProcessScript.render', () => {
	it('targets host.docker.internal on the endpoint port, sends the placeholder variable as the bearer, and holds no credential', () => {
		const script = CredentialProcessScript.render(41234);

		expect(script.startsWith('#!/bin/bash\n')).toBe(true);
		expect(script).toContain('"http://host.docker.internal:41234/credentials?profile=${alias_name}"');
		expect(script).toContain('-H "Authorization: Bearer ${FLOW_CREDENTIAL_TOKEN}"');
		expect(CREDENTIAL_TOKEN_VARIABLE).toBe('FLOW_CREDENTIAL_TOKEN');
		expect(script).not.toMatch(/AKIA|ASIA|aws_secret|SecretAccessKey/);
	});

	it('refuses a port that is not a TCP port', () => {
		for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
			const error = failure(() => CredentialProcessScript.render(port), String(port));

			expect(error.message, String(port)).toContain('needs the endpoint port (1 to 65535)');
		}
	});
});

/**
 * Runs the rendered script with bash and a stand-in `curl` first on the PATH, to check the script's own logic
 * (argument checks, status handling, error text). The real HTTP exchange is covered by the live acceptance run.
 */
describe('CredentialProcessScript executed by bash', () => {
	const runner = new NodeCommandRunner();

	async function run(options: {
		args: string[];
		token?: string;
		curlStatus?: string;
		curlBody?: string;
		curlExit?: number;
	}): Promise<{ exitCode: number; stdout: string; stderr: string; curlArguments: string }> {
		const directory = temp();
		const scriptPath = path.join(directory, 'credential-process.sh');
		fs.writeFileSync(scriptPath, CredentialProcessScript.render(41234), { mode: 0o755 });
		const binDirectory = path.join(directory, 'bin');
		fs.mkdirSync(binDirectory);
		const argumentsFile = path.join(directory, 'curl-arguments.txt');
		// The stand-in curl records its arguments, writes the body to the -o file and prints the status like -w would.
		fs.writeFileSync(
			path.join(binDirectory, 'curl'),
			[
				'#!/bin/bash',
				`printf '%s\\n' "$@" > '${argumentsFile.replace(/\\/g, '/')}'`,
				'out=""',
				'while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done',
				'if [ "${FAKE_CURL_EXIT:-0}" != "0" ]; then echo "curl: (7) Failed to connect" >&2; exit "$FAKE_CURL_EXIT"; fi',
				'printf "%s" "$FAKE_CURL_BODY" > "$out"',
				'printf "%s" "$FAKE_CURL_STATUS"',
				'',
			].join('\n'),
			{ mode: 0o755 }
		);
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
			FAKE_CURL_STATUS: options.curlStatus ?? '200',
			FAKE_CURL_BODY: options.curlBody ?? '{"Version":1}',
			FAKE_CURL_EXIT: String(options.curlExit ?? 0),
		};
		delete env[CREDENTIAL_TOKEN_VARIABLE];
		if (options.token !== undefined) env[CREDENTIAL_TOKEN_VARIABLE] = options.token;

		const result = await runner.run({
			command: 'bash',
			args: [scriptPath.replace(/\\/g, '/'), ...options.args],
			env,
			timeoutMs: 30_000,
		});
		const curlArguments = fs.existsSync(argumentsFile) ? fs.readFileSync(argumentsFile, 'utf8') : '';
		return { ...result, curlArguments };
	}

	it('has valid bash syntax', async () => {
		const directory = temp();
		const scriptPath = path.join(directory, 'script.sh');
		fs.writeFileSync(scriptPath, CredentialProcessScript.render(41234));

		const result = await runner.run({
			command: 'bash',
			args: ['-n', scriptPath.replace(/\\/g, '/')],
			timeoutMs: 30_000,
		});

		expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
	});

	it('prints the document the endpoint answered with 200 and asks for the alias with the bearer', async () => {
		const result = await run({
			args: ['claude'],
			token: 'flow-ph-placeholder',
			curlBody: '{"Version":1,"AccessKeyId":"A"}',
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('{"Version":1,"AccessKeyId":"A"}');
		expect(result.curlArguments.split('\n')).toEqual(
			expect.arrayContaining([
				'-H',
				'Authorization: Bearer flow-ph-placeholder',
				'http://host.docker.internal:41234/credentials?profile=claude',
			])
		);
	});

	it('exits 1 with an actionable message on a non-200 status, an unreachable endpoint, and a missing token variable (curl is not called without a token)', async () => {
		// Independent runs (each has its own directory): started together.
		const [refused, unreachable, noToken] = await Promise.all([
			run({
				args: ['claude'],
				token: 'flow-ph-placeholder',
				curlStatus: '503',
				curlBody: '{"error":{"code":"sso-expired","message":"Run aws sso login --profile p"}}',
			}),
			run({ args: ['claude'], token: 'flow-ph-placeholder', curlExit: 7 }),
			run({ args: ['claude'] }),
		]);
		expect(refused.exitCode).toBe(1);
		expect(refused.stdout).toBe('');
		expect(refused.stderr).toBe(
			'flow credential_process: the credential endpoint answered HTTP 503: {"error":{"code":"sso-expired","message":"Run aws sso login --profile p"}}\n'
		);

		expect(unreachable.exitCode).toBe(1);
		expect(unreachable.stdout).toBe('');
		expect(unreachable.stderr).toContain('curl: (7) Failed to connect');
		expect(unreachable.stderr).toContain(
			'cannot reach the credential endpoint on host.docker.internal:41234. Is the wrapper running and is its network rule (localhost:41234) still in place?'
		);

		expect(noToken.exitCode).toBe(1);
		expect(noToken.stderr).toContain('FLOW_CREDENTIAL_TOKEN is not set in the environment of the tool');
		expect(noToken.curlArguments).toBe('');
	});

	it('refuses a missing alias, one with a path or query separator, and one that is too long, without calling curl', async () => {
		const cases: [string, string[]][] = [
			['no alias', []],
			['an alias with a slash', ['a/b']],
			['an alias with a query separator', ['a&b=c']],
			['an alias that is too long', ['a'.repeat(65)]],
		];
		const results = await Promise.all(cases.map(([, args]) => run({ args, token: 'flow-ph-placeholder' })));

		cases.forEach(([label], index) => {
			const result = results[index];
			expect(result?.exitCode, label).toBe(1);
			expect(result?.stderr, label).toBe(
				'flow credential_process: expected a profile alias as the first argument (letters, digits, _ and -)\n'
			);
			expect(result?.curlArguments, label).toBe('');
		});
	});
});
