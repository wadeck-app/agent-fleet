import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { type AwsProcessCredentials, type CredentialSource } from './AwsCredentialExporter';
import { CredentialGlueInstaller } from './CredentialGlueInstaller';
import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { HostCredentialEndpoint } from './HostCredentialEndpoint';
import { PathTranslator } from './PathTranslator';
import { type CredentialAccessRequest, SandboxCredentialAccess } from './SandboxCredentialAccess';
import { SandboxError } from './SandboxError';
import { SandboxNetworkRules } from './SandboxNetworkRules';
import { rejection } from './testing/ExpectedFailures';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const DOCUMENT: AwsProcessCredentials = { Version: 1, AccessKeyId: 'ASIAEXAMPLE', SecretAccessKey: 'example-secret' };

const roots: string[] = [];
const endpoints: HostCredentialEndpoint[] = [];

afterEach(async () => {
	for (const endpoint of endpoints.splice(0)) await endpoint.stop();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

interface Fixture {
	runtime: FakeSandboxRuntime;
	endpoint: HostCredentialEndpoint;
	access: SandboxCredentialAccess;
	log: RecordingSandboxLog;
	tempDirectory: string;
	exported: string[];
}

const request: CredentialAccessRequest = {
	sandbox: 'box-1',
	aliases: ['claude'],
	region: 'us-east-1',
	tools: ['claude', 'codex'],
};

async function fixture(
	overrides: { tempInsideWorkspace?: boolean; fixedPlaceholder?: boolean } = {}
): Promise<Fixture> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-access-'));
	roots.push(root);
	const workspace = path.join(root, 'ws');
	const meta = path.join(root, 'ws.meta');
	const tempDirectory = path.join(overrides.tempInsideWorkspace === true ? workspace : root, 'secrets');
	for (const directory of [workspace, meta]) fs.mkdirSync(directory);
	fs.mkdirSync(tempDirectory);

	const log = new RecordingSandboxLog();
	const exported: string[] = [];
	const source: CredentialSource = {
		export: hostProfile => {
			exported.push(hostProfile);
			return Promise.resolve(DOCUMENT);
		},
	};
	const endpoint = new HostCredentialEndpoint({
		source,
		profiles: { claude: 'host-claude', codex: 'host-codex' },
		log,
		wallClock: () => new Date(0),
	});
	endpoints.push(endpoint);
	await endpoint.start();

	const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
	await runtime.create({ name: 'box-1', agent: 'claude', mounts: [{ hostPath: workspace }], cpus: 2, memory: '2g' });
	const access = new SandboxCredentialAccess({
		runtime,
		endpoint,
		networkRules: new SandboxNetworkRules(runtime, log),
		glue: new CredentialGlueInstaller(runtime),
		translator: new PathTranslator({
			workspaceDir: workspace,
			workspaceMetaDir: meta,
			platform: process.platform,
		}),
		tempDirectory,
		log,
		...(overrides.fixedPlaceholder === false ? {} : { generatePlaceholder: () => 'flow-ph-fixed-placeholder' }),
	});
	return { runtime, endpoint, access, log, tempDirectory, exported };
}

async function get(port: number, secret: string, alias: string): Promise<number> {
	const response = await fetch(`http://127.0.0.1:${port}/credentials?profile=${alias}`, {
		headers: { Authorization: `Bearer ${secret}` },
	});
	await response.arrayBuffer();
	return response.status;
}

/** The secret file named by the `cat "<path>"` command sbx will run. */
function secretFileOf(valueCommand: string): string {
	const match = /^cat "(.+)"$/.exec(valueCommand);
	if (match?.[1] === undefined) throw new Error(`Unexpected value command: ${valueCommand}`);
	return match[1];
}

describe('SandboxCredentialAccess.attach', () => {
	it('wires the grant, the secret file, the rules, the sbx secret and the VM files, returns the tool environment, and never lets the real secret or an AWS key reach the runtime or the log', async () => {
		const { runtime, endpoint, access, exported, log } = await fixture();

		const handle = await access.attach(request);

		expect(handle.env).toEqual({
			AWS_CONFIG_FILE: '/home/agent/.flow-credentials/aws-config',
			AWS_REGION: 'us-east-1',
			FLOW_CREDENTIAL_TOKEN: 'flow-ph-fixed-placeholder',
		});
		const state = runtime.state('box-1');
		expect([...state.networkRules]).toEqual([
			`localhost:${endpoint.port}`,
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'bedrock-mantle.us-east-1.api.aws:443',
		]);
		const [sbxSecret] = [...state.secrets.values()];
		expect(state.secrets.size).toBe(1);
		expect(sbxSecret).toMatchObject({
			sandbox: 'box-1',
			hosts: ['localhost'],
			envVar: 'FLOW_CREDENTIAL_TOKEN',
			placeholder: 'flow-ph-fixed-placeholder',
		});
		expect(runtime.callsTo('exec')).toHaveLength(2);

		// The secret read from the file is accepted by the endpoint for the granted alias only.
		const secret = fs.readFileSync(secretFileOf(sbxSecret?.valueCommand ?? ''), 'utf8');
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
		expect(await get(endpoint.port, secret, 'claude')).toBe(200);
		expect(await get(endpoint.port, secret, 'codex')).toBe(403);
		expect(exported).toEqual(['host-claude']);

		const everythingSentToTheRuntime = JSON.stringify(runtime.calls.map(call => call.request));
		expect(everythingSentToTheRuntime).not.toContain(secret);
		expect(everythingSentToTheRuntime).not.toMatch(/AKIA|ASIA|aws_secret|SecretAccessKey/);
		expect(log.text()).not.toContain(secret);
	});

	it('generates a flow-ph placeholder with 128 random bits by default, different for each sandbox access', async () => {
		const first = await fixture({ fixedPlaceholder: false });
		const second = await fixture({ fixedPlaceholder: false });

		const a = await first.access.attach(request);
		const b = await second.access.attach(request);

		expect(a.env['FLOW_CREDENTIAL_TOKEN']).toMatch(/^flow-ph-[0-9a-f]{32}$/);
		expect(b.env['FLOW_CREDENTIAL_TOKEN']).toMatch(/^flow-ph-[0-9a-f]{32}$/);
		expect(a.env['FLOW_CREDENTIAL_TOKEN']).not.toBe(b.env['FLOW_CREDENTIAL_TOKEN']);
	});

	it('refuses a temporary directory inside a sandbox mount, and an alias the endpoint does not know, before creating anything', async () => {
		const inside = await fixture({ tempInsideWorkspace: true });

		const error = await rejection(inside.access.attach(request));

		expect(error.kind).toBe('invalid-options');
		expect(error.message).toContain('is inside a sandbox mount');
		expect(inside.runtime.calls.map(call => call.method)).toEqual(['create']);
		expect(fs.readdirSync(inside.tempDirectory)).toEqual([]);

		const { runtime, access, tempDirectory } = await fixture();

		const unknown = await rejection(access.attach({ ...request, aliases: ['nope'] }));

		expect(unknown.message).toContain('Profile alias "nope" is not configured');
		expect(fs.readdirSync(tempDirectory)).toEqual([]);
		expect(runtime.calls.map(call => call.method)).toEqual(['create']);
	});
});

describe('SandboxCredentialAccess rollback', () => {
	// Each entry makes ONE step of attach fail; whatever the step, nothing may stay behind.
	const failures: { step: string; message: string; inject: (fixture: Fixture) => Error | undefined }[] = [
		{
			step: 'storing the secret file',
			message: 'ENOENT',
			inject: ({ tempDirectory }) => {
				// The directory vanishes: PrivateSecretFile.create fails after the grant was made.
				fs.rmSync(tempDirectory, { recursive: true, force: true });
				return undefined;
			},
		},
		{
			step: 'adding the network rules',
			message: 'policy allow failed',
			inject: ({ runtime }) => {
				const failure = new SandboxError('command-failed', 'policy allow failed');
				runtime.failNext('allowNetwork', failure);
				return failure;
			},
		},
		{
			step: 'storing the sbx secret',
			message: 'sbx secret set-custom failed',
			inject: ({ runtime }) => {
				const failure = new SandboxError('command-failed', 'sbx secret set-custom failed');
				runtime.failNext('setSecret', failure);
				return failure;
			},
		},
		{
			step: 'writing the first VM file',
			message: 'read-only file system',
			inject: ({ runtime }) => {
				runtime.setExecHandler(() => ({ exitCode: 1, stdout: '', stderr: 'read-only file system' }));
				return undefined;
			},
		},
		{
			step: 'writing the second VM file',
			message: 'disk full',
			inject: ({ runtime }) => {
				let writes = 0;
				runtime.setExecHandler(() => {
					writes += 1;
					return writes === 1
						? { exitCode: 0, stdout: '', stderr: '' }
						: { exitCode: 1, stdout: '', stderr: 'disk full' };
				});
				return undefined;
			},
		},
	];

	it('leaves no partial state whichever step fails: no sbx secret, no rule, no secret file, no grant; the failing step error is rethrown', async () => {
		for (const { step, message, inject } of failures) {
			const made = await fixture();
			const injected = inject(made);

			const error = await made.access.attach(request).then(
				() => undefined,
				(caught: unknown) => caught
			);

			expect(error, step).toBeInstanceOf(Error);
			if (injected !== undefined) expect(error, step).toBe(injected);
			expect((error as Error).message, step).toContain(message);
			expect(made.runtime.state('box-1').secrets.size, `${step}: sbx secret`).toBe(0);
			expect([...made.runtime.state('box-1').networkRules], `${step}: network rules`).toEqual([]);
			expect(made.runtime.state('box-1').serviceSecrets.size, `${step}: service secrets`).toBe(0);
			if (fs.existsSync(made.tempDirectory)) {
				expect(fs.readdirSync(made.tempDirectory), `${step}: secret file`).toEqual([]);
			}
			// The grant is gone: registering the same sandbox again works, and the old secret is not valid.
			expect(() => made.endpoint.registerSandbox('box-1', ['claude']), `${step}: grant`).not.toThrow();
			// A rollback step is only run for a step that was done.
			if (step === 'storing the secret file' || step === 'adding the network rules') {
				expect(made.runtime.callsTo('removeSecret'), `${step}: removeSecret`).toEqual([]);
			}
			if (step === 'storing the secret file') {
				expect(made.runtime.callsTo('removeNetwork'), `${step}: removeNetwork`).toEqual([]);
			}
		}
	});

	it('logs a failing rollback step as a warning and still throws the original error', async () => {
		const { runtime, access, log } = await fixture();
		const original = new SandboxError('command-failed', 'setSecret failed');
		runtime.failNext('setSecret', original);
		runtime.failNext('removeNetwork', new SandboxError('command-failed', 'policy rm failed'));

		await expect(access.attach(request)).rejects.toBe(original);

		expect(log.lines).toContain('warn: credential access rollback step failed: sandbox=box-1 - policy rm failed');
	});
});

describe('SandboxCredentialAccess.detach', () => {
	it('removes the sbx secret, the rules, the grant and the secret file, the endpoint refuses the old secret, and a second detach is a no-op', async () => {
		const { runtime, endpoint, access, tempDirectory, log } = await fixture();
		const handle = await access.attach(request);
		const [sbxSecret] = [...runtime.state('box-1').secrets.values()];
		const secret = fs.readFileSync(secretFileOf(sbxSecret?.valueCommand ?? ''), 'utf8');

		await handle.detach();
		await handle.detach();

		expect(runtime.state('box-1').secrets.size).toBe(0);
		expect([...runtime.state('box-1').networkRules]).toEqual([]);
		expect(fs.readdirSync(tempDirectory)).toEqual([]);
		expect(await get(endpoint.port, secret, 'claude')).toBe(403);
		expect(log.lines.filter(line => line.includes('credential access removed'))).toEqual([
			'info: credential access removed: sandbox=box-1',
		]);
		expect(runtime.callsTo('removeSecret')).toHaveLength(1);
	});

	it('is quiet when the sandbox was already removed', async () => {
		const { runtime, access, tempDirectory } = await fixture();
		const handle = await access.attach(request);
		await runtime.remove('box-1');

		await expect(handle.detach()).resolves.toBeUndefined();

		expect(fs.readdirSync(tempDirectory)).toEqual([]);
	});

	it('finishes the other steps and reports the one that failed', async () => {
		const { runtime, endpoint, access, tempDirectory } = await fixture();
		const handle = await access.attach(request);
		runtime.failNext('removeNetwork', new SandboxError('command-failed', 'policy rm failed'));

		const error = await rejection(handle.detach());

		expect(error.message).toBe(
			'Removing the credential access of sandbox "box-1" failed in 1 step(s), the others were done: policy rm failed. ' +
				'Remove the sandbox to drop everything scoped to it.'
		);
		expect(runtime.state('box-1').secrets.size).toBe(0);
		expect(fs.readdirSync(tempDirectory)).toEqual([]);
		expect(() => endpoint.registerSandbox('box-1', ['claude'])).not.toThrow();
	});
});
