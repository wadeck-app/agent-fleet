import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AwsProcessCredentials } from '../AwsCredentialExporter';
import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { BridgeTokenGuard } from './BridgeTokenGuard';
import { BRIDGE_TOKEN_VARIABLE, CredentialedSandboxPreparer } from './CredentialedSandboxPreparer';

const DOCUMENT: AwsProcessCredentials = { Version: 1, AccessKeyId: 'ASIAEXAMPLE', SecretAccessKey: 'example-secret' };
const SANDBOX = 'flow-sbx-h1-run1';

let root: string;
let secrets: string;
let runtime: FakeSandboxRuntime;
let endpoint: HostCredentialEndpoint;
let log: RecordingSandboxLog;
let tokens: BridgeTokenGuard;
let mounts: RunMounts;
let vmEnvironment: string;

const VM_ENVIRONMENT = [
	'PATH=/usr/bin',
	'HTTPS_PROXY=http://gateway.docker.internal:3128',
	'HTTP_PROXY=http://gateway.docker.internal:3128',
	'NO_PROXY=localhost,127.0.0.1',
	'NODE_USE_ENV_PROXY=1',
	'GH_TOKEN=gho_sbxproxymanaged000000000000000000000',
].join('\n');

beforeEach(async () => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preparer-')));
	secrets = path.join(root, 'secrets');
	for (const directory of ['ws', 'ws.meta', 'secrets']) fs.mkdirSync(path.join(root, directory));
	log = new RecordingSandboxLog();
	vmEnvironment = VM_ENVIRONMENT;
	runtime = new FakeSandboxRuntime({
		clock: new FakeClock(Date.UTC(2026, 9, 27)),
		execHandler: request => ({
			exitCode: 0,
			stdout: request.command[0] === 'env' ? vmEnvironment : '',
			stderr: '',
		}),
	});
	await runtime.create({
		name: SANDBOX,
		agent: 'claude',
		mounts: [{ hostPath: path.join(root, 'ws') }, { hostPath: path.join(root, 'ws.meta') }],
		cpus: 2,
		memory: '2g',
	});
	endpoint = new HostCredentialEndpoint({
		source: { export: () => Promise.resolve(DOCUMENT) },
		profiles: { claude: 'host-profile' },
		log,
		wallClock: () => new Date(),
	});
	await endpoint.start();
	tokens = new BridgeTokenGuard();
	mounts = new RunMounts({
		workspaceDir: path.join(root, 'ws'),
		workspaceMetaDir: path.join(root, 'ws.meta'),
		platform: process.platform,
		log,
	});
});

afterEach(async () => {
	await endpoint.stop();
	fs.rmSync(root, { recursive: true, force: true });
});

function preparer(modelEnvironment: Record<string, string> = {}): CredentialedSandboxPreparer {
	return new CredentialedSandboxPreparer({
		runtime,
		endpoint,
		tokens,
		log,
		platform: process.platform,
		secretsDirectory: secrets,
		profileAlias: 'claude',
		region: 'us-east-1',
		modelEnvironment,
	});
}

/** Mounts whose second (meta) mount is missing: the step after the credential access throws. */
function mountsWithoutMeta(): RunMounts {
	return Object.create(mounts, { sandboxMounts: { value: () => [mounts.sandboxMounts()[0]] } }) as RunMounts;
}

describe('CredentialedSandboxPreparer', () => {
	it('opens the bridge port and the Bedrock host for this sandbox only', async () => {
		await preparer().prepare(SANDBOX, mounts, 45678);

		const rules = runtime.state(SANDBOX).networkRules;
		expect(rules.has('localhost:45678')).toBe(true);
		expect(rules.has(`localhost:${endpoint.port}`)).toBe(true);
		expect(rules.has('bedrock-runtime.us-east-1.amazonaws.com:443')).toBe(true);
	});

	it('stores the bridge token as a secret for host localhost and gives the exec only the placeholder', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts, 45678);

		const secret = [...runtime.state(SANDBOX).secrets.values()].find(item => item.envVar === BRIDGE_TOKEN_VARIABLE);
		expect(secret?.hosts).toEqual(['localhost']);
		expect(secret?.placeholder).toMatch(/^flow-ph-[0-9a-f]{32}$/);
		expect(secret?.valueCommand).toContain('cat');
		expect(prepared.innerEnv).toEqual({
			FLOW_BRIDGE_URL: 'ws://host.docker.internal:45678/',
			[BRIDGE_TOKEN_VARIABLE]: secret?.placeholder,
		});
		// The real token is only reachable through the private file the command reads; the bridge expects it.
		const file = secret?.valueCommand.replace(/^cat\s+/, '').replace(/^"|"$/g, '') ?? '';
		const real = fs.readFileSync(file, 'utf8').trim();
		expect(tokens.verify(real)).toEqual({ ok: true });
		expect(JSON.stringify(prepared)).not.toContain(real);
	});

	it('gives model steps the Bedrock environment and the session store on the meta mount', async () => {
		const prepared = await preparer({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'some-model' }).prepare(
			SANDBOX,
			mounts,
			45678
		);

		const env = prepared.envFor('model');
		expect(env).toMatchObject({
			AWS_PROFILE: 'claude',
			AWS_REGION: 'us-east-1',
			CLAUDE_CODE_USE_BEDROCK: '1',
			ANTHROPIC_DEFAULT_SONNET_MODEL: 'some-model',
		});
		expect(env['AWS_CONFIG_FILE']).toContain('/home/agent/.flow-credentials');
		expect(env['CLAUDE_CONFIG_DIR']).toBe(
			mounts.toSandboxPath(path.join(root, 'ws.meta', 'sessions', 'claude'), 'x')
		);
		expect(fs.existsSync(path.join(root, 'ws.meta', 'sessions', 'claude'))).toBe(true);
	});

	it('copies the proxy variables of the VM into the model environment (a model step is started with an isolated one)', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts, 45678);

		expect(prepared.envFor('model')).toMatchObject({
			HTTPS_PROXY: 'http://gateway.docker.internal:3128',
			HTTP_PROXY: 'http://gateway.docker.internal:3128',
			NO_PROXY: 'localhost,127.0.0.1',
			NODE_USE_ENV_PROXY: '1',
		});
		expect(Object.keys(prepared.envFor('model'))).not.toContain('GH_TOKEN');
	});

	it('fails and undoes everything when the VM has no proxy variables (the model steps would bypass the proxy)', async () => {
		vmEnvironment = 'PATH=/usr/bin';

		await expect(preparer().prepare(SANDBOX, mounts, 45678)).rejects.toThrow('bypass the sbx proxy');

		expect(tokens.verify('x'.repeat(48)).ok).toBe(false);
		expect(runtime.state(SANDBOX).networkRules.size).toBe(0);
		expect([...runtime.state(SANDBOX).secrets.values()]).toEqual([]);
	});

	it('gives script steps no environment at all (no credential reaches a script)', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts, 45678);

		expect(prepared.envFor('script')).toEqual({});
	});

	it('undoes the credential access and the token when the bridge secret cannot be stored', async () => {
		runtime.failNext('setSecret', new SandboxError('command-failed', 'secret store down'), {
			when: request => (request as { envVar: string }).envVar === BRIDGE_TOKEN_VARIABLE,
		});

		await expect(preparer().prepare(SANDBOX, mounts, 45678)).rejects.toThrow('secret store down');

		expect(tokens.verify('x'.repeat(48)).ok).toBe(false);
		expect(runtime.state(SANDBOX).networkRules.size).toBe(0);
		expect([...runtime.state(SANDBOX).secrets.values()]).toEqual([]);
	});

	it('rolls everything back, token included, when preparing fails after the VM environment was read, so a retry works', async () => {
		await expect(preparer().prepare(SANDBOX, mountsWithoutMeta(), 45678)).rejects.toThrow(
			'RunMounts must have two mounts'
		);

		const verdict = tokens.verify('x'.repeat(48));
		expect(verdict.ok === false && verdict.reason).toContain('no bridge token is expected');
		expect(runtime.state(SANDBOX).networkRules.size).toBe(0);
		expect([...runtime.state(SANDBOX).secrets.values()]).toEqual([]);
		await expect(preparer().prepare(SANDBOX, mounts, 45678)).resolves.toBeDefined();
	});

	it('logs, and does not swallow, a failure of its own rollback', async () => {
		runtime.failNext('removeSecret', new SandboxError('command-failed', 'secret store down'));

		await expect(preparer().prepare(SANDBOX, mountsWithoutMeta(), 45678)).rejects.toThrow(
			'RunMounts must have two mounts'
		);

		expect(log.text()).toContain('secret store down');
	});

	it('detach revokes the token and removes what was added', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts, 45678);

		await prepared.detach();

		expect(runtime.state(SANDBOX).networkRules.size).toBe(0);
		expect([...runtime.state(SANDBOX).secrets.values()]).toEqual([]);
	});
});
