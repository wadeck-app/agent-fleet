import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { SandboxNetworkRules, type SandboxNetworkRulesRequest } from './SandboxNetworkRules';
import { failure } from './testing/ExpectedFailures';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const base: SandboxNetworkRulesRequest = {
	sandbox: 'box-1',
	endpointPort: 41000,
	region: 'us-east-1',
	tools: ['claude'],
};

async function fakeWithSandbox(): Promise<{
	runtime: FakeSandboxRuntime;
	rules: SandboxNetworkRules;
	log: RecordingSandboxLog;
}> {
	const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
	await runtime.create({
		name: 'box-1',
		agent: 'claude',
		mounts: [{ hostPath: '/work/ws' }],
		cpus: 2,
		memory: '2g',
	});
	const log = new RecordingSandboxLog();
	return { runtime, rules: new SandboxNetworkRules(runtime, log), log };
}

describe('SandboxNetworkRules.resourcesFor', () => {
	const rules = new SandboxNetworkRules(
		new FakeSandboxRuntime({ clock: new FakeClock() }),
		new RecordingSandboxLog()
	);

	it('opens the endpoint port on localhost and the Bedrock runtime host of the given region for Claude, OpenCode gets the same', () => {
		expect(rules.resourcesFor(base)).toEqual(['localhost:41000', 'bedrock-runtime.us-east-1.amazonaws.com:443']);
		expect(rules.resourcesFor({ ...base, region: 'eu-west-3' })).toEqual([
			'localhost:41000',
			'bedrock-runtime.eu-west-3.amazonaws.com:443',
		]);
		expect(rules.resourcesFor({ ...base, tools: ['opencode'] })).toEqual(rules.resourcesFor(base));
	});

	it('adds the Bedrock mantle host for Codex and github.com only when asked, without repeating a host shared by several tools', () => {
		expect(rules.resourcesFor({ ...base, tools: ['codex'] })).toEqual([
			'localhost:41000',
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'bedrock-mantle.us-east-1.api.aws:443',
		]);
		expect(rules.resourcesFor({ ...base, tools: ['codex'], codexNeedsGithub: true })).toEqual([
			'localhost:41000',
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'bedrock-mantle.us-east-1.api.aws:443',
			'github.com:443',
		]);
		expect(rules.resourcesFor({ ...base, tools: ['claude', 'codex', 'opencode'] })).toEqual([
			'localhost:41000',
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'bedrock-mantle.us-east-1.api.aws:443',
		]);
	});

	it('adds the bridge port and the extra allowed hosts after the model hosts', () => {
		expect(
			rules.resourcesFor({
				...base,
				bridgePort: 42000,
				extraAllowedHosts: ['registry.npmjs.org:443', 'localhost:41000'],
			})
		).toEqual([
			'localhost:41000',
			'localhost:42000',
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'registry.npmjs.org:443',
		]);
	});

	it('refuses every request that could open an unintended host (injected region, catch-all, no port) with the reason', () => {
		const cases: [string, Partial<SandboxNetworkRulesRequest>, string][] = [
			[
				'port 0 (the endpoint is not started)',
				{ endpointPort: 0 },
				'endpointPort must be a TCP port between 1 and 65535, got 0',
			],
			['a port above 65535', { endpointPort: 70000 }, 'got 70000'],
			['a fractional port', { endpointPort: 80.5 }, 'got 80.5'],
			['a bad bridge port', { bridgePort: -1 }, 'bridgePort must be a TCP port'],
			['an empty region', { region: '' }, 'AWS region "" is not valid'],
			['a region that injects a host', { region: 'us-east-1.evil.com/x' }, 'is not valid'],
			['no tool', { tools: [] }, 'needs at least one model tool'],
			['an unknown tool', { tools: ['gemini'] }, 'Model tool "gemini" is not supported'],
			['a catch-all extra host', { extraAllowedHosts: ['**:443'] }, 'catch-all patterns are refused'],
			[
				'an extra host without port',
				{ extraAllowedHosts: ['example.org'] },
				'Network resource "example.org" is not valid',
			],
		];
		for (const [label, override, message] of cases) {
			const error = failure(() => rules.resourcesFor({ ...base, ...override }), label);

			expect(error.kind, label).toBe('invalid-argument');
			expect(error.message, label).toContain(message);
		}
	});
});

describe('SandboxNetworkRules.apply and revoke', () => {
	it('adds the rules to the named sandbox, logs them, and removes exactly them', async () => {
		const { runtime, rules, log } = await fakeWithSandbox();

		const applied = await rules.apply({ ...base, tools: ['codex'] });
		const afterApply = [...runtime.state('box-1').networkRules];
		await rules.revoke({ ...base, tools: ['codex'] });

		expect(applied).toEqual([
			'localhost:41000',
			'bedrock-runtime.us-east-1.amazonaws.com:443',
			'bedrock-mantle.us-east-1.api.aws:443',
		]);
		expect(afterApply).toEqual([...applied]);
		expect([...runtime.state('box-1').networkRules]).toEqual([]);
		expect(log.lines).toEqual([
			`info: network rules added: sandbox=box-1 resources=${applied.join(',')}`,
			`info: network rules removed: sandbox=box-1 resources=${applied.join(',')}`,
		]);
	});

	it('only ever calls the per-sandbox rule methods, each with the sandbox name (never a machine-wide rule)', async () => {
		const { runtime, rules } = await fakeWithSandbox();

		await rules.apply({ ...base, bridgePort: 42000, extraAllowedHosts: ['example.org:443'] });
		await rules.revoke(base);

		const calls = runtime.calls.filter(call => call.method !== 'create');
		expect(calls.map(call => call.method)).toEqual(['allowNetwork', 'removeNetwork']);
		for (const call of calls) {
			expect((call.request as { sandbox: string }).sandbox).toBe('box-1');
		}
	});

	it('fails without touching the sandbox when the request is invalid, and lets the runtime error through when the sandbox does not exist', async () => {
		const { runtime, rules } = await fakeWithSandbox();

		await expect(rules.apply({ ...base, region: 'nope' })).rejects.toThrow('AWS region "nope" is not valid');
		expect(runtime.calls.map(call => call.method)).toEqual(['create']);

		await expect(rules.apply({ ...base, sandbox: 'ghost-1' })).rejects.toMatchObject({ kind: 'not-found' });
	});
});
