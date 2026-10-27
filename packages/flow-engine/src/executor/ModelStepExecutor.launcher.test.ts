/**
 * The onCompact hook of a model step runs through the ProcessLauncher given in the step config
 * (C4 seam). Real child_process functions throw, so a direct use fails the test.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ModelProvider } from '../processing/ModelProvider';
import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import type { ModelFlowStep } from '../types';
import { executeModelStep } from './ModelStepExecutor';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

describe('ModelStepExecutor -- ProcessLauncher seam', () => {
	it('runs the onCompact command through config.processLauncher', async () => {
		const fake = new FakeProcessLauncher();
		const hookChild = createFakeChild(4321);
		fake.queueChild(hookChild);
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: options => {
				options.onStreamEvent?.({
					type: 'result',
					subtype: 'result',
					data: { terminal_reason: 'rapid_refill_breaker' },
				} as any);
				// The hook command is started synchronously by the event above.
				hookChild.emit('close', 0);
				return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
		const step: ModelFlowStep = {
			id: 'gen',
			name: 'Generate',
			type: 'model',
			provider: 'claude',
			model: 'terra',
			prompt: 'Hello',
			onCompact: { command: 'echo hook' },
		};

		const trace = await executeModelStep(
			step,
			process.cwd(),
			{ inputs: {}, stepOutputs: new Map() } as any,
			{ stepId: step.id, stepName: step.name, stepType: 'model', startTime: Date.now() },
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'terra', processLauncher: fake },
			{
				templateRenderer: { render: () => 'Hello' } as any,
				outputExtractor: { extract: () => ({ response: 'Hello world' }) } as any,
			}
		);

		expect(trace.error).toBeUndefined();
		expect(fake.callsOf('spawn').map(call => call.command)).toEqual(['echo hook']);
	});
});
