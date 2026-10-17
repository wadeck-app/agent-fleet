/**
 * A parent model step relaunched because a sub-step failed resumes its own previous session
 * and receives only the sub-step feedback, instead of having its whole prompt re-rendered.
 *
 * Hand-written recording ModelProvider -- no real CLI launch.
 */
import { describe, expect, it } from 'vitest';

import type { LaunchOptions, ModelProvider } from '../processing/ModelProvider';
import { OutputExtractor } from '../processing/OutputExtractor';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { TemplateContext } from '../processing/TemplateRenderer';
import type { ModelFlowStep, StepTrace } from '../types';
import { executeModelStep } from './ModelStepExecutor';

const ORIGINAL_PROMPT =
	'ORIGINAL-PROMPT task=${{ inputs.task }}{% if subSteps.verify.status.failed %} HAD-SUBSTEPS${{ subStepFeedback }}{% endif %}';

function makeStep(overrides: Partial<ModelFlowStep> = {}): ModelFlowStep {
	return {
		id: 'phase',
		name: 'Phase',
		type: 'model',
		provider: 'opencode',
		model: 'terra',
		prompt: ORIGINAL_PROMPT,
		...overrides,
	};
}

function makeTrace(step: ModelFlowStep): StepTrace {
	return { stepId: step.id, stepName: step.name, stepType: 'model', startTime: Date.now() };
}

interface RecordingProvider extends ModelProvider {
	launches: LaunchOptions[];
}

function makeProvider(options: { supportsSessionResume?: boolean } = {}): RecordingProvider {
	const launches: LaunchOptions[] = [];
	return {
		launches,
		...(options.supportsSessionResume !== undefined
			? { supportsSessionResume: options.supportsSessionResume }
			: {}),
		launchInteractive: () => Promise.resolve({ response: 'ok', exitCode: 0 }),
		launchBackground: opts => {
			launches.push(opts);
			return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
		},
		kill: () => {},
	};
}

function makeContext(extra: Partial<TemplateContext> = {}): TemplateContext {
	return {
		inputs: { task: 'T1' },
		stepOutputs: new Map(),
		taskMetadata: {},
		stepMeta: new Map([['phase', { session_id: 'ses_first', session_file: '' }]]),
		...extra,
	};
}

async function run(step: ModelFlowStep, provider: ModelProvider, context: TemplateContext): Promise<StepTrace> {
	return executeModelStep(
		step,
		'/workspace',
		context,
		makeTrace(step),
		{
			interactive: false,
			provider,
			providerName: 'opencode',
			resolvedModel: 'terra',
			executionConfig: { streamJson: false },
		},
		{ templateRenderer: new TemplateRenderer(), outputExtractor: new OutputExtractor() }
	);
}

describe('ModelStepExecutor -- first launch (unchanged)', () => {
	it('sends the original prompt with no resumeSessionId, and ${{ subStepFeedback }} / {% if subSteps.verify.status.failed %} still render', async () => {
		const provider = makeProvider({ supportsSessionResume: true });
		const withoutSubSteps = await run(makeStep(), provider, makeContext());

		expect(withoutSubSteps.error).toBeUndefined();
		expect(provider.launches[0]?.resumeSessionId).toBeUndefined();
		expect(provider.launches[0]?.prompt).toBe('ORIGINAL-PROMPT task=T1');

		const subSteps = new Map([['verify', { outputs: { stderr: 'E0' }, status: 'failed' }]]);
		await run(makeStep(), provider, makeContext({ subSteps, subStepFeedback: '[verify]\nE0' }));
		expect(provider.launches[1]?.resumeSessionId).toBeUndefined();
		expect(provider.launches[1]?.prompt).toBe('ORIGINAL-PROMPT task=T1 HAD-SUBSTEPS[verify]\nE0');
	});
});

describe('ModelStepExecutor -- relaunch after a sub-step failure', () => {
	it('resumes the session captured on the first run, with no `session:` field on the step', async () => {
		const provider = makeProvider({ supportsSessionResume: true });
		const step = makeStep();
		expect(step.session).toBeUndefined();

		const trace = await run(step, provider, makeContext({ subStepRelaunch: { feedback: '[verify]\nE1' } }));

		expect(trace.error).toBeUndefined();
		expect(provider.launches).toHaveLength(1);
		expect(provider.launches[0]?.resumeSessionId).toBe('ses_first');
	});

	it('sends only the feedback (with a short wrapper): contains E1, not the original prompt', async () => {
		const provider = makeProvider({ supportsSessionResume: true });

		const trace = await run(makeStep(), provider, makeContext({ subStepRelaunch: { feedback: '[verify]\nE1' } }));

		const sent = provider.launches[0]?.prompt ?? '';
		expect(sent).toContain('E1');
		expect(sent).toContain('[verify]');
		expect(sent).not.toContain('ORIGINAL-PROMPT');
		expect(sent).not.toContain('task=T1');
		// What the trace records is what was actually sent
		expect(trace.prompt).toBe(sent);
	});

	it('does not template-render the feedback (a ${{ }} in a script error stays literal)', async () => {
		const provider = makeProvider({ supportsSessionResume: true });

		await run(makeStep(), provider, makeContext({ subStepRelaunch: { feedback: '[v]\nbad ${{ inputs.task }}' } }));

		expect(provider.launches[0]?.prompt).toContain('bad ${{ inputs.task }}');
	});

	it('uses subStepFeedbackPrompt as the wrapper when the step declares one', async () => {
		const provider = makeProvider({ supportsSessionResume: true });
		const step = makeStep({ subStepFeedbackPrompt: 'Validation failed, fix it:\n${{ subStepFeedback }}\nThanks.' });

		await run(step, provider, makeContext({ subStepRelaunch: { feedback: '[verify]\nE1' } }));

		expect(provider.launches[0]?.prompt).toBe('Validation failed, fix it:\n[verify]\nE1\nThanks.');
	});

	it('fails loudly when no session_id was recorded for the previous run (no silent fresh conversation)', async () => {
		const provider = makeProvider({ supportsSessionResume: true });
		const context = makeContext({
			stepMeta: new Map([['phase', { session_id: '', session_file: '' }]]),
			subStepRelaunch: { feedback: '[verify]\nE1' },
		});

		const trace = await run(makeStep(), provider, context);

		expect(provider.launches).toHaveLength(0);
		expect(trace.error).toContain("'phase'");
		expect(trace.error).toContain('session_id');
		expect(trace.error).toContain('sub-step');
	});

	it('fails loudly when there is no meta at all for the step', async () => {
		const provider = makeProvider({ supportsSessionResume: true });
		const context = makeContext({ stepMeta: new Map(), subStepRelaunch: { feedback: '[verify]\nE1' } });

		const trace = await run(makeStep(), provider, context);

		expect(provider.launches).toHaveLength(0);
		expect(trace.error).toContain('session_id');
	});

	it('fails loudly when the provider cannot resume a session', async () => {
		const provider = makeProvider({ supportsSessionResume: false });

		const trace = await run(makeStep(), provider, makeContext({ subStepRelaunch: { feedback: '[verify]\nE1' } }));

		expect(provider.launches).toHaveLength(0);
		expect(trace.error).toContain("'phase'");
		expect(trace.error).toContain('opencode');
		expect(trace.error).toContain('resume');
	});

	it('treats a provider that does not declare resume support as unable to resume', async () => {
		const provider = makeProvider();

		const trace = await run(makeStep(), provider, makeContext({ subStepRelaunch: { feedback: '[verify]\nE1' } }));

		expect(provider.launches).toHaveLength(0);
		expect(trace.error).toContain('resume');
	});
});
