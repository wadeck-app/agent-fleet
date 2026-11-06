import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CredentialGlueInstaller } from './CredentialGlueInstaller';
import { CredentialProcessScript } from './CredentialProcessScript';
import { FakeClock } from './FakeClock';
import { type FakeExecHandler, FakeSandboxRuntime } from './FakeSandboxRuntime';
import { SandboxError } from './SandboxError';
import type { ExecRequest } from './SandboxRuntime';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function runtimeWith(execHandler: FakeExecHandler): Promise<FakeSandboxRuntime> {
	const runtime = new FakeSandboxRuntime({ clock: new FakeClock(), execHandler });
	await runtime.create({ name: 'box-1', agent: 'claude', mounts: [{ hostPath: '/w' }], cpus: 2, memory: '2g' });
	return runtime;
}

const request = { sandbox: 'box-1', endpointPort: 41234, aliases: ['claude', 'codex'], region: 'us-east-1' };

describe('CredentialGlueInstaller', () => {
	it('writes the script (0700) then the AWS config (0600) through bash, content on standard input', async () => {
		const seen: ExecRequest[] = [];
		const runtime = await runtimeWith(execRequest => {
			seen.push(execRequest);
			return { exitCode: 0, stdout: '', stderr: '' };
		});

		const glue = await new CredentialGlueInstaller(runtime).install(request);

		expect(glue).toEqual({
			scriptPath: '/home/agent/.flow-credentials/credential-process.sh',
			awsConfigPath: '/home/agent/.flow-credentials/aws-config',
			env: { AWS_CONFIG_FILE: '/home/agent/.flow-credentials/aws-config', AWS_REGION: 'us-east-1' },
		});
		expect(seen.map(call => call.command)).toEqual([
			[
				'bash',
				'-c',
				'set -e; mkdir -p "$(dirname "$1")"; cat > "$1"; chmod "$2" "$1"',
				'flow-credential-glue',
				'/home/agent/.flow-credentials/credential-process.sh',
				'0700',
			],
			[
				'bash',
				'-c',
				'set -e; mkdir -p "$(dirname "$1")"; cat > "$1"; chmod "$2" "$1"',
				'flow-credential-glue',
				'/home/agent/.flow-credentials/aws-config',
				'0600',
			],
		]);
		expect(seen[0]?.stdin).toBe(CredentialProcessScript.render(41234));
		expect(seen[1]?.stdin).toContain(
			'[profile codex]\ncredential_process = /home/agent/.flow-credentials/credential-process.sh codex\n'
		);
		expect(seen.every(call => call.sandbox === 'box-1' && call.env === undefined)).toBe(true);
	});

	it('uses another directory when given one', async () => {
		const seen: ExecRequest[] = [];
		const runtime = await runtimeWith(execRequest => {
			seen.push(execRequest);
			return { exitCode: 0, stdout: '', stderr: '' };
		});

		const glue = await new CredentialGlueInstaller(runtime, '/opt/creds').install(request);

		expect(glue.scriptPath).toBe('/opt/creds/credential-process.sh');
		expect(seen[0]?.command.at(-2)).toBe('/opt/creds/credential-process.sh');
	});

	it('writes nothing when the request is invalid', async () => {
		const runtime = await runtimeWith(() => ({ exitCode: 0, stdout: '', stderr: '' }));

		const error = await new CredentialGlueInstaller(runtime).install({ ...request, endpointPort: 0 }).then(
			() => undefined,
			(caught: unknown) => caught
		);

		expect(error).toBeInstanceOf(SandboxError);
		expect(runtime.calls.filter(call => call.method === 'exec')).toEqual([]);
	});

	it('reports the failing file, the exit code and the stderr, and stops before the second file', async () => {
		const runtime = await runtimeWith(() => ({ exitCode: 1, stdout: '', stderr: 'mkdir: Permission denied\n' }));

		const error = await new CredentialGlueInstaller(runtime).install(request).then(
			() => undefined,
			(caught: unknown) => caught
		);

		expect(error).toBeInstanceOf(SandboxError);
		expect((error as SandboxError).kind).toBe('command-failed');
		expect((error as SandboxError).message).toBe(
			'Writing /home/agent/.flow-credentials/credential-process.sh in sandbox "box-1" failed with exit code 1: mkdir: Permission denied. ' +
				'Check that the image has bash and that /home/agent is writable.'
		);
		expect(runtime.calls.filter(call => call.method === 'exec')).toHaveLength(1);
	});

	it('says "(no error output)" when the failing command printed nothing', async () => {
		const runtime = await runtimeWith(() => ({ exitCode: 3, stdout: '', stderr: '' }));

		await expect(new CredentialGlueInstaller(runtime).install(request)).rejects.toThrow(
			'failed with exit code 3: (no error output)'
		);
	});

	it('the command it sends really creates the directory and the files when run by bash', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-glue-'));
		roots.push(root);
		// Git Bash form of the temp path (/c/Users/...), the form the installer accepts for a sandbox path.
		const directory = path
			.join(root, 'nested', 'creds')
			.replace(/\\/g, '/')
			.replace(/^([A-Za-z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`);
		const runtime = await runtimeWith(execRequest => {
			const result = spawnSync('bash', execRequest.command.slice(1), {
				input: typeof execRequest.stdin === 'string' ? execRequest.stdin : '',
				encoding: 'utf8',
			});
			return { exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
		});

		const glue = await new CredentialGlueInstaller(runtime, directory).install(request);

		expect(glue.scriptPath).toBe(`${directory}/credential-process.sh`);
		expect(fs.readFileSync(path.join(root, 'nested', 'creds', 'credential-process.sh'), 'utf8')).toBe(
			CredentialProcessScript.render(41234)
		);
		expect(fs.readFileSync(path.join(root, 'nested', 'creds', 'aws-config'), 'utf8')).toContain('[profile claude]');
	});
});
