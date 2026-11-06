import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultProcessLauncher } from '../processing/DefaultProcessLauncher';
import type { OutputExtractor } from '../processing/OutputExtractor';
import type { ProcessLauncher } from '../processing/ProcessLauncher';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import type { ScriptFlowStep, StepTrace } from '../types';
import { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn() };
});

/**
 * A launcher that declares `isolatesEnvironment` (a sandbox, a VM) must not receive the worker's ambient environment:
 * launch tokens, cloud profiles and host-only variables stay out of it by construction. The host launcher is unchanged.
 */

const AMBIENT = { FLOW_WORKER_TOKEN: 'launch-token-value', AWS_PROFILE: 'prod-admin', HOST_ONLY_VAR: 'host' };
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = Object.fromEntries(Object.keys(AMBIENT).map(name => [name, process.env[name]]));
	Object.assign(process.env, AMBIENT);
});

afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	vi.clearAllMocks();
});

const stepRun = (scriptExecutor: ScriptExecutor) =>
	executeScriptStep(
		{
			id: 's1',
			name: 'S1',
			type: 'script',
			script: 'echo ok',
			env: { STEP_VAR: 'declared' },
			secrets: ['API_TOKEN'],
		} as unknown as ScriptFlowStep,
		process.cwd(),
		{
			inputs: {},
			stepOutputs: new Map(),
			taskMetadata: {},
			secrets: { API_TOKEN: 'secret-value' },
		} as TemplateContext,
		{ stepId: 's1' } as StepTrace,
		{
			templateRenderer: new TemplateRenderer(),
			scriptExecutor,
			outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
		}
	);

async function envThrough(launcher: FakeProcessLauncher): Promise<Record<string, string>> {
	const child = createFakeChild();
	launcher.queueChild(child);
	const done = stepRun(new ScriptExecutor(launcher));
	await vi.waitFor(() => expect(launcher.callsOf('spawn')).toHaveLength(1));
	child.emit('close', 0);
	await done;
	return launcher.callsOf('spawn')[0]!.options.env as Record<string, string>;
}

describe('what each launcher declares', () => {
	it('the host launcher declares that it does not isolate the environment', () => {
		expect(new DefaultProcessLauncher().isolatesEnvironment).toBe(false);
	});

	it('the fake launcher declares false unless a test says otherwise', () => {
		expect(new FakeProcessLauncher().isolatesEnvironment).toBe(false);
		expect(new FakeProcessLauncher({ isolatesEnvironment: true }).isolatesEnvironment).toBe(true);
	});

	it('ScriptExecutor reports what its launcher declares; a launcher that says nothing is the host', () => {
		const silent = new FakeProcessLauncher() as ProcessLauncher & { isolatesEnvironment?: boolean };
		delete silent.isolatesEnvironment;

		expect(new ScriptExecutor().isolatesEnvironment).toBe(false);
		expect(new ScriptExecutor(silent).isolatesEnvironment).toBe(false);
		expect(new ScriptExecutor(new FakeProcessLauncher({ isolatesEnvironment: true })).isolatesEnvironment).toBe(
			true
		);
	});
});

describe('a script step through a launcher that isolates the environment', () => {
	it('gets no ambient worker variable, but its declared env and its secrets', async () => {
		const env = await envThrough(new FakeProcessLauncher({ isolatesEnvironment: true }));

		expect(env['FLOW_WORKER_TOKEN']).toBeUndefined();
		expect(env['AWS_PROFILE']).toBeUndefined();
		expect(env['HOST_ONLY_VAR']).toBeUndefined();
		expect(env['STEP_VAR']).toBe('declared');
		expect(env['API_TOKEN']).toBe('secret-value');
		expect((env['PATH'] ?? env['Path']) !== undefined).toBe(true);
	});

	it('still gets the whole worker environment through a launcher that does not isolate it', async () => {
		const env = await envThrough(new FakeProcessLauncher());

		expect(env['FLOW_WORKER_TOKEN']).toBe('launch-token-value');
		expect(env['AWS_PROFILE']).toBe('prod-admin');
		expect(env['HOST_ONLY_VAR']).toBe('host');
		expect(env['STEP_VAR']).toBe('declared');
		expect(env['API_TOKEN']).toBe('secret-value');
	});

	it('still gets the whole worker environment through the host launcher (spawn mocked)', async () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new EventEmitter(),
			stderr: new EventEmitter(),
			pid: 4321,
			kill: vi.fn(),
		});
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);

		const done = stepRun(new ScriptExecutor());
		await vi.waitFor(() => expect(vi.mocked(child_process.spawn)).toHaveBeenCalledTimes(1));
		child.emit('close', 0);
		await done;

		const env = vi.mocked(child_process.spawn).mock.calls[0]![2]!.env as Record<string, string>;
		expect(env['FLOW_WORKER_TOKEN']).toBe('launch-token-value');
		expect(env['AWS_PROFILE']).toBe('prod-admin');
		expect(env['STEP_VAR']).toBe('declared');
		expect(env['API_TOKEN']).toBe('secret-value');
	});
});
