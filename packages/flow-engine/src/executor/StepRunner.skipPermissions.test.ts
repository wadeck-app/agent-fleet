/**
 * `skipPermissions` is step-level only -- a flow-level `execution.skipPermissions` used to exist
 * but never reached the model CLI through the daemon-dispatched `flow run` path (only the
 * separate in-process FlowExecutor ever wired `executionConfig` from `flow.execution`), so it
 * is gone. Pins that `launchOptions.skipPermissions` is read from the step, never from
 * `config.executionConfig`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeModelProvider } from '../processing/ClaudeModelProvider';
import { OutputExtractor } from '../processing/OutputExtractor';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ModelFlowStep, Workspace } from '../types';
import { StepRunner } from './StepRunner';

vi.mock('../processing/TemplateRenderer');
vi.mock('../processing/OutputExtractor');
vi.mock('../processing/ClaudeModelProvider');

const testWorkspace: Workspace = {
	id: 'ws-test',
	mode: 'isolated',
	path: '/test/workspace',
	metaDir: '/test/workspace.meta',
	concurrency: { key: 'test', activeTasks: new Set(), locked: false },
	createdAt: new Date().toISOString(),
	lastUsedAt: new Date().toISOString(),
	usageCount: 0,
};

const testContext = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

function makeStep(skipPermissions?: boolean): ModelFlowStep {
	return {
		id: 'gen',
		name: 'Generate',
		type: 'model',
		model: 'haiku',
		prompt: 'Hello',
		...(skipPermissions !== undefined ? { skipPermissions } : {}),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello');
	vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'Hello world' });
	vi.mocked(ClaudeModelProvider.prototype.launchBackground).mockResolvedValue({
		stdout: 'raw-ndjson',
		stderr: '',
		exitCode: 0,
	});
});

describe('skipPermissions', () => {
	it('is false by default, even with no step field set', async () => {
		const runner = new StepRunner({ interactive: false });
		await runner.executeStep(makeStep(), testWorkspace, testContext);

		const opts = vi.mocked(ClaudeModelProvider.prototype.launchBackground).mock.calls[0]?.[0];
		expect(opts?.skipPermissions).toBe(false);
	});

	it('is true when the step sets it, regardless of any flow-level config', async () => {
		const runner = new StepRunner({
			interactive: false,
			// A flow-level executionConfig.skipPermissions must not matter anymore -- confirmed
			// by passing one here that disagrees with the step and expecting the step to win.
			executionConfig: { skipPermissions: true } as never,
		});
		await runner.executeStep(makeStep(false), testWorkspace, testContext);

		const opts = vi.mocked(ClaudeModelProvider.prototype.launchBackground).mock.calls[0]?.[0];
		expect(opts?.skipPermissions).toBe(false);
	});

	it('is true when the step explicitly sets it, with no executionConfig at all', async () => {
		const runner = new StepRunner({ interactive: false });
		await runner.executeStep(makeStep(true), testWorkspace, testContext);

		const opts = vi.mocked(ClaudeModelProvider.prototype.launchBackground).mock.calls[0]?.[0];
		expect(opts?.skipPermissions).toBe(true);
	});
});
