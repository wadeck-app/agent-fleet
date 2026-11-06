import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import type { ScriptFlowStep, StepTrace } from '../types';
import { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

/**
 * Pins which variables reach the spawn of a script step TODAY, through a launcher that records the call:
 * a script step runs with the worker's whole environment (isolateEnv false), and ScriptExecutor with isolateEnv true
 * keeps only a short allow-list. In both, the step's declared env and its secrets reach the process.
 */

const AMBIENT = { FLOW_WORKER_TOKEN: 'launch-token-value', AWS_PROFILE: 'prod-admin', HOST_ONLY_VAR: 'host' };
let launcher: FakeProcessLauncher;
let saved: Record<string, string | undefined>;

beforeEach(() => {
	launcher = new FakeProcessLauncher();
	saved = Object.fromEntries(Object.keys(AMBIENT).map(name => [name, process.env[name]]));
	Object.assign(process.env, AMBIENT);
});

afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

/** Runs `start`, completes the child the launcher handed out, and returns the env of the one spawn call. */
async function spawnEnvOf(start: () => Promise<unknown>): Promise<Record<string, string>> {
	const child = createFakeChild();
	launcher.queueChild(child);
	const done = start();
	await vi.waitFor(() => expect(launcher.callsOf('spawn')).toHaveLength(1));
	child.emit('close', 0);
	await done;
	const [call] = launcher.callsOf('spawn');
	return call!.options.env as Record<string, string>;
}

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

describe('the environment of a script step spawn - characterization', () => {
	it('a script step gets the whole worker environment, with its declared env and its secrets', async () => {
		const env = await spawnEnvOf(() => stepRun(new ScriptExecutor(launcher)));

		expect(env['FLOW_WORKER_TOKEN']).toBe('launch-token-value');
		expect(env['AWS_PROFILE']).toBe('prod-admin');
		expect(env['HOST_ONLY_VAR']).toBe('host');
		expect(env['STEP_VAR']).toBe('declared');
		expect(env['API_TOKEN']).toBe('secret-value');
	});

	it('ScriptExecutor with isolateEnv true keeps a short allow-list plus the declared env, and nothing ambient', async () => {
		const env = await spawnEnvOf(() =>
			new ScriptExecutor(launcher).execute({
				script: 'echo ok',
				isolateEnv: true,
				env: { STEP_VAR: 'declared', API_TOKEN: 'secret-value' },
			})
		);

		expect(env['FLOW_WORKER_TOKEN']).toBeUndefined();
		expect(env['AWS_PROFILE']).toBeUndefined();
		expect(env['HOST_ONLY_VAR']).toBeUndefined();
		expect(env['STEP_VAR']).toBe('declared');
		expect(env['API_TOKEN']).toBe('secret-value');
		const allowed = new Set([
			'PATH',
			'Path',
			'HOME',
			'TMPDIR',
			'TEMP',
			'TMP',
			'SystemRoot',
			'USERPROFILE',
			'FLOW_BASH_PATH',
			'STEP_VAR',
			'API_TOKEN',
		]);
		expect(Object.keys(env).filter(name => !allowed.has(name))).toEqual([]);
	});
});
