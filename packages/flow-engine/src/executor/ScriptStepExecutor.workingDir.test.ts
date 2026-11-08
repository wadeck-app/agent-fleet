import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import type { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

const WORKSPACE = path.join(os.tmpdir(), 'fleet-workspace');
const ABSOLUTE = path.join(os.tmpdir(), 'fleet-elsewhere');

async function workingDirPassedToExecutor(
	stepExtra: Record<string, unknown>,
	context: Record<string, unknown> = {}
): Promise<string | undefined> {
	const execute = vi.fn().mockResolvedValue({ success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1 });
	await executeScriptStep(
		{ id: 'call', name: 'Call', type: 'script', script: 'echo ok', ...stepExtra } as unknown as ScriptFlowStep,
		WORKSPACE,
		{ inputs: {}, stepOutputs: new Map(), taskMetadata: {}, context } as unknown as TemplateContext,
		{ stepId: 'call' } as StepTrace,
		{
			templateRenderer: new TemplateRenderer(),
			scriptExecutor: { execute } as unknown as ScriptExecutor,
			outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
		}
	);
	return execute.mock.calls[0][0].workingDir;
}

describe('executeScriptStep - workingDir', () => {
	it('defaults to the workspace', async () => {
		expect(await workingDirPassedToExecutor({})).toBe(WORKSPACE);
	});

	it('resolves a relative step workingDir against the workspace', async () => {
		expect(await workingDirPassedToExecutor({ workingDir: 'packages/web' })).toBe(
			path.resolve(WORKSPACE, 'packages/web')
		);
	});

	it('resolves a relative flow-level workingDir (context.workingDir) against the workspace', async () => {
		expect(await workingDirPassedToExecutor({}, { workingDir: './sub' })).toBe(path.resolve(WORKSPACE, './sub'));
	});

	it('lets the step workingDir win over the flow-level one', async () => {
		expect(await workingDirPassedToExecutor({ workingDir: 'a' }, { workingDir: 'b' })).toBe(
			path.resolve(WORKSPACE, 'a')
		);
	});

	it('keeps an absolute workingDir as is', async () => {
		expect(await workingDirPassedToExecutor({ workingDir: ABSOLUTE })).toBe(ABSOLUTE);
		expect(await workingDirPassedToExecutor({}, { workingDir: ABSOLUTE })).toBe(ABSOLUTE);
	});
});
