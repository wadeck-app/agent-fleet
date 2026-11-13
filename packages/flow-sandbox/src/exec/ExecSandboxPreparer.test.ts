import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AwsProcessCredentials } from '../AwsCredentialExporter';
import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import { RunMounts } from '../RunMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { ExecSandboxPreparer } from './ExecSandboxPreparer';

const DOCUMENT: AwsProcessCredentials = { Version: 1, AccessKeyId: 'ASIAEXAMPLE', SecretAccessKey: 'example-secret' };
const SANDBOX = 'flow-sbx-x1-run1';

let root: string;
let runtime: FakeSandboxRuntime;
let endpoint: HostCredentialEndpoint;
let log: RecordingSandboxLog;
let mounts: RunMounts;

beforeEach(async () => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-exec-preparer-')));
	for (const directory of ['ws', 'ws.meta', 'secrets']) fs.mkdirSync(path.join(root, directory));
	log = new RecordingSandboxLog();
	runtime = new FakeSandboxRuntime({ clock: new FakeClock(Date.UTC(2026, 9, 27)) });
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

function preparer(modelEnvironment: Record<string, string> = {}): ExecSandboxPreparer {
	return new ExecSandboxPreparer({
		runtime,
		endpoint,
		log,
		platform: process.platform,
		secretsDirectory: path.join(root, 'secrets'),
		profileAlias: 'claude',
		region: 'us-east-1',
		modelEnvironment,
	});
}

/** Mounts whose second (meta) mount is missing: the step after the credential access throws. */
function mountsWithoutMeta(): RunMounts {
	return Object.create(mounts, {
		metaMount: {
			value: () => {
				throw new Error('RunMounts must have two mounts');
			},
		},
	}) as RunMounts;
}

describe('ExecSandboxPreparer for codex and opencode (plain prompt steps)', () => {
	const bedrock = 'bedrock-runtime.us-east-1.amazonaws.com:443';
	const mantle = 'bedrock-mantle.us-east-1.api.aws:443';

	it('prepares for codex: the Bedrock hosts of codex, CODEX_HOME on the .meta mount with a config that selects the Bedrock provider, no claude variable', async () => {
		const prepared = await preparer({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-x' }).prepare(
			SANDBOX,
			mounts,
			'codex'
		);

		expect([...runtime.state(SANDBOX).networkRules].sort()).toEqual(
			[`localhost:${endpoint.port}`, bedrock, mantle].sort()
		);
		const env = prepared.envFor('model', 'codex');
		expect(env['CODEX_HOME']).toMatch(/sessions\/codex$/);
		expect(env['AWS_CONFIG_FILE']).toBe('/home/agent/.flow-credentials/aws-config');
		expect(Object.keys(env).filter(name => /^CLAUDE|^ANTHROPIC/.test(name))).toEqual([]);
		const config = fs.readFileSync(path.join(root, 'ws.meta', 'sessions', 'codex', 'config.toml'), 'utf8');
		expect(config).toContain('model_provider = "amazon-bedrock"');
		expect(config).toMatch(
			/\[model_providers\.amazon-bedrock\.aws\][\s\S]*profile = "claude"[\s\S]*region = "us-east-1"/
		);
		expect(config).toMatch(/\[features\][\s\S]*plugins = false/);
		expect(JSON.stringify(env)).not.toMatch(/ASIAEXAMPLE|example-secret/);
	});

	it('prepares for opencode: the Bedrock host, the AWS profile and the data store on the .meta mount, no claude variable', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts, 'opencode');

		expect([...runtime.state(SANDBOX).networkRules].sort()).toEqual([`localhost:${endpoint.port}`, bedrock].sort());
		const env = prepared.envFor('model', 'opencode');
		expect(env).toMatchObject({ AWS_PROFILE: 'claude', AWS_REGION: 'us-east-1' });
		expect(env['XDG_DATA_HOME']).toMatch(/sessions\/opencode$/);
		expect(fs.existsSync(path.join(root, 'ws.meta', 'sessions', 'opencode'))).toBe(true);
		expect(Object.keys(env).filter(name => /^CLAUDE|^ANTHROPIC/.test(name))).toEqual([]);
	});

	it('adds only the hosts a later tool needs (no duplicate rule), once, and never widens a script step', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts);
		const rulesBefore = runtime.callsTo('allowNetwork').length;

		await prepared.ensureTool('codex');
		await prepared.ensureTool('codex');

		const added = runtime.callsTo('allowNetwork').slice(rulesBefore);
		expect(added).toHaveLength(1);
		expect((added[0]?.request as { resources: string[] }).resources).toEqual([mantle]);
		expect(prepared.envFor('script', undefined)).toEqual({});
		expect(prepared.envFor('model', 'codex')['CODEX_HOME']).toMatch(/sessions\/codex$/);
	});

	it('refuses the environment of a tool that was not ensured, instead of returning an empty one', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts);

		expect(() => prepared.envFor('model', 'opencode')).toThrow(/opencode[\s\S]*ensureTool/);
	});
});

describe('ExecSandboxPreparer', () => {
	it('opens only the credential endpoint and the Bedrock host for this sandbox (no bridge port)', async () => {
		await preparer().prepare(SANDBOX, mounts);
		const rules = [...runtime.state(SANDBOX).networkRules];
		expect(rules.sort()).toEqual(
			[`localhost:${endpoint.port}`, 'bedrock-runtime.us-east-1.amazonaws.com:443'].sort()
		);
	});

	it('gives model steps the Bedrock environment and the session store on the .meta mount, script steps nothing', async () => {
		const prepared = await preparer({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-x' }).prepare(SANDBOX, mounts);
		const model = prepared.envFor('model', 'claude');
		expect(model).toMatchObject({
			AWS_PROFILE: 'claude',
			AWS_REGION: 'us-east-1',
			CLAUDE_CODE_USE_BEDROCK: '1',
			ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-x',
		});
		expect(model['CLAUDE_CONFIG_DIR']).toMatch(/sessions\/claude$/);
		expect(model['AWS_CONFIG_FILE']).toBe('/home/agent/.flow-credentials/aws-config');
		expect(prepared.envFor('script', undefined)).toEqual({});
		// No AWS key material in what the VM is given.
		expect(JSON.stringify(model)).not.toMatch(/ASIAEXAMPLE|example-secret/);
		// The bridge variables of the relay variant do not exist here.
		expect(Object.keys(model).some(name => name.startsWith('FLOW_BRIDGE'))).toBe(false);
	});

	it('does not copy the proxy variables (sbx exec keeps the sandbox environment)', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts);
		expect(Object.keys(prepared.envFor('model', 'claude')).some(name => /proxy/i.test(name))).toBe(false);
	});

	it('rolls the credential access back when preparing fails after it was attached, so a retry works', async () => {
		await expect(preparer().prepare(SANDBOX, mountsWithoutMeta())).rejects.toThrow(
			'RunMounts must have two mounts'
		);

		expect(runtime.state(SANDBOX).networkRules.size).toBe(0);
		expect([...runtime.state(SANDBOX).secrets.values()]).toEqual([]);
		await expect(preparer().prepare(SANDBOX, mounts)).resolves.toBeDefined();
	});

	it('detach removes the credential access', async () => {
		const prepared = await preparer().prepare(SANDBOX, mounts);
		await prepared.detach();
		expect(runtime.state(SANDBOX).networkRules.has('bedrock-runtime.us-east-1.amazonaws.com:443')).toBe(false);
	});
});
