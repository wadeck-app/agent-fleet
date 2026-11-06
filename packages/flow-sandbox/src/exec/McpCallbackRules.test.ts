import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { SandboxError } from '../SandboxError';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { McpCallbackRules } from './McpCallbackRules';

let runtime: FakeSandboxRuntime;
let log: RecordingSandboxLog;
let rules: McpCallbackRules;

beforeEach(async () => {
	runtime = new FakeSandboxRuntime({ clock: new FakeClock(0) });
	log = new RecordingSandboxLog();
	rules = new McpCallbackRules(runtime, log);
	await runtime.create({
		name: 'box',
		agent: 'claude',
		mounts: [{ hostPath: process.cwd() }],
		cpus: 1,
		memory: '1g',
	});
});

describe('McpCallbackRules', () => {
	it('adds a rule scoped to the sandbox for the port and removes exactly that rule', async () => {
		const close = await rules.open('box', 41234);
		expect(runtime.callsTo('allowNetwork').map(call => call.request)).toEqual([
			{ sandbox: 'box', resources: ['localhost:41234'] },
		]);
		await close();
		await close();
		expect(runtime.callsTo('removeNetwork').map(call => call.request)).toEqual([
			{ sandbox: 'box', resources: ['localhost:41234'] },
		]);
		expect(log.text()).toMatch(/rule added.*rule removed/s);
	});

	it('refuses an invalid port before touching the sandbox', async () => {
		await expect(rules.open('box', 0)).rejects.toThrow(/invalid rule/);
		expect(runtime.callsTo('allowNetwork')).toHaveLength(0);
	});

	it('does not throw when the removal fails: it logs the command to run', async () => {
		const close = await rules.open('box', 41235);
		runtime.failNext('removeNetwork', new SandboxError('command-failed', 'sbx exploded'));
		await close();
		expect(log.text()).toMatch(
			/warn: Could not remove the MCP callback rule localhost:41235 of sandbox "box": sbx exploded.*sbx policy rm network --sandbox box/
		);
	});

	it('is silent when the sandbox is already gone', async () => {
		const close = await rules.open('box', 41236);
		runtime.failNext('removeNetwork', new SandboxError('not-found', 'no such sandbox'));
		await close();
		expect(log.text()).not.toMatch(/warn:/);
	});
});
