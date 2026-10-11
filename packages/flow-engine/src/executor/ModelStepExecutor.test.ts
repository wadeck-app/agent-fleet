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

describe('ModelStepExecutor -- empty-output guard opencode hint', () => {
	// Headless opencode hangs on a permission prompt (e.g. external_directory) nothing can
	// answer, eventually exiting 0 with no output and zero metered tokens -- the empty-output
	// guard already catches this as a failure; this just makes the error say why, for the one
	// provider where it is a known, common cause.
	function emptyResultProvider(): ModelProvider {
		return {
			launchInteractive: () => Promise.resolve({ response: '', exitCode: 0 }),
			launchBackground: options => {
				options.onStreamEvent?.({
					type: 'result',
					subtype: 'result',
					data: { result: '', total_cost_usd: 0 },
				} as any);
				return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
			},
			kill: vi.fn(),
		};
	}

	it('appends a permission hint when the step provider is opencode', async () => {
		const step = makeStep();
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider: emptyResultProvider(), providerName: 'opencode', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('zero tokens');
		expect(trace.error).toContain('permission');
		expect(trace.error).toContain('external_directory');
	});

	it('does not append the opencode hint for a non-opencode provider', async () => {
		const step = makeStep({ provider: 'claude' });
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as any,
			makeTrace(step),
			{ interactive: false, provider: emptyResultProvider(), providerName: 'claude', resolvedModel: 'terra' },
			{ templateRenderer: templateRenderer as any, outputExtractor: outputExtractor as any }
		);

		expect(trace.error).toContain('zero tokens');
		expect(trace.error).not.toContain('permission');
	});
});
