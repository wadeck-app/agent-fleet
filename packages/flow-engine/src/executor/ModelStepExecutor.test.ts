/**
 * Tests for the model-step timeout mechanism (step.timeout, in minutes).
 * Uses a hand-written mock ModelProvider -- no real CLI launch, no vi.mock on a concrete provider.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ModelProvider } from '../processing/ModelProvider';
import type { ModelFlowStep, StepTrace } from '../types';
import { executeModelStep } from './ModelStepExecutor';

function makeStep(overrides: Partial<ModelFlowStep> = {}): ModelFlowStep {
	return {
		id: 'gen',
		name: 'Generate',
		type: 'model',
		provider: 'opencode',
		model: 'terra',
		prompt: 'Hello',
		...overrides,
	};
}

function makeTrace(step: ModelFlowStep): StepTrace {
	return {
		stepId: step.id,
		stepName: step.name,
		stepType: 'model',
		startTime: Date.now(),
	};
}

const templateRenderer = { render: () => 'Hello' };
const outputExtractor = { extract: () => ({ response: 'Hello world' }) };

describe('ModelStepExecutor -- step.timeout', () => {
	it('fails the step with an actionable message and kills the provider when the timeout fires before the provider resolves', async () => {
		const kill = vi.fn();
		// Never resolves on its own -- only provider.kill() being called (asserted below) can end it.
		const provider: ModelProvider = {
			launchInteractive: () => new Promise(() => {}),
			launchBackground: () => new Promise(() => {}),
			kill,
		};

		const step = makeStep({ timeout: 1 / 60_000 }); // ~1ms in minutes
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeDefined();
		expect(trace.error).toContain("Model step 'gen'");
		expect(trace.error).toContain('provider: opencode');
		expect(trace.error).toContain('model: terra');
		expect(trace.error).toContain('timed out after');
		expect(trace.error).toContain('killed');
		expect(kill).toHaveBeenCalledTimes(1);
	});

	it('succeeds normally when the provider resolves before the timeout, and never calls kill()', async () => {
		const kill = vi.fn();
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: () => Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 }),
			kill,
		};

		const step = makeStep({ timeout: 5 }); // 5 minutes -- resolves long before that
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeUndefined();
		expect(kill).not.toHaveBeenCalled();
	});

	it('does not race at all when step.timeout is unset (no behavior change for existing flows)', async () => {
		const kill = vi.fn();
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
			launchBackground: () => Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 }),
			kill,
		};

		const step = makeStep();
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toBeUndefined();
		expect(kill).not.toHaveBeenCalled();
	});
});
