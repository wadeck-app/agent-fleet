import { describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import type { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

const SECRET_VALUE = 'sup3r-secret-value';

function setup() {
	const execute = vi.fn().mockResolvedValue({ success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1 });
	const services = {
		templateRenderer: new TemplateRenderer(),
		scriptExecutor: { execute } as unknown as ScriptExecutor,
		outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
	};
	const run = (extra: Record<string, unknown>, context: Partial<TemplateContext>) =>
		executeScriptStep(
			{ id: 'call', name: 'Call', type: 'script', script: 'echo ok', ...extra } as unknown as ScriptFlowStep,
			process.cwd(),
			{ inputs: {}, stepOutputs: new Map(), taskMetadata: {}, ...context } as TemplateContext,
			{ stepId: 'call' } as StepTrace,
			services
		);
	return { execute, run };
}

describe('executeScriptStep - secrets', () => {
	it('injects each declared secret as an environment variable', async () => {
		const { execute, run } = setup();
		await run({ secrets: ['API_TOKEN'], env: { OTHER: 'x' } }, { secrets: { API_TOKEN: SECRET_VALUE } });
		expect(execute.mock.calls[0][0].env).toEqual({ OTHER: 'x', API_TOKEN: SECRET_VALUE });
	});

	it('works without step env', async () => {
		const { execute, run } = setup();
		await run({ secrets: ['API_TOKEN'] }, { secrets: { API_TOKEN: SECRET_VALUE } });
		expect(execute.mock.calls[0][0].env).toEqual({ API_TOKEN: SECRET_VALUE });
	});

	it('lets the explicit secret win over a step env entry of the same name', async () => {
		const { execute, run } = setup();
		await run({ secrets: ['API_TOKEN'], env: { API_TOKEN: 'from-env' } }, { secrets: { API_TOKEN: SECRET_VALUE } });
		expect(execute.mock.calls[0][0].env.API_TOKEN).toBe(SECRET_VALUE);
	});

	it('keeps the rendered env in the trace, without the declared secrets', async () => {
		const { run } = setup();
		const trace = await run(
			{ secrets: ['API_TOKEN'], env: { REGION: '${{ inputs.region }}' } },
			{ inputs: { region: 'eu' }, secrets: { API_TOKEN: SECRET_VALUE } }
		);
		expect(trace.env).toEqual({ REGION: 'eu' });
		expect(JSON.stringify(trace)).not.toContain(SECRET_VALUE);
	});

	it('fails fast naming the step and the secret when the worker did not receive it', async () => {
		const { execute, run } = setup();
		const failure = await run({ secrets: ['API_TOKEN'] }, { secrets: { OTHER_SECRET: SECRET_VALUE } }).catch(
			(error: Error) => error
		);
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain("'call'");
		expect((failure as Error).message).toContain('API_TOKEN');
		expect((failure as Error).message).toContain('flow-cli');
		expect((failure as Error).message).not.toContain(SECRET_VALUE);
		expect(execute).not.toHaveBeenCalled();
	});

	it('fails when no secrets were supplied at all', async () => {
		const { run } = setup();
		await expect(run({ secrets: ['API_TOKEN'] }, {})).rejects.toThrow('API_TOKEN');
	});

	it('does not require secrets for a step that declares none', async () => {
		const { execute, run } = setup();
		await run({}, {});
		expect(execute.mock.calls[0][0].env).toBeUndefined();
	});

	it('resolves ${{ inputs.NAME }} from the inputs the worker merged', async () => {
		const { execute, run } = setup();
		await run({ env: { T: '${{ inputs.API_TOKEN }}' } }, { inputs: { API_TOKEN: SECRET_VALUE } });
		expect(execute.mock.calls[0][0].env).toEqual({ T: SECRET_VALUE });
	});
});
