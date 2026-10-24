import { referencedInputNames } from 'flow-core';
import type { StepTrace } from 'flow-engine/types';

import type { AssignableStep, ExecutionContext, StepIoCapture } from '../ipc/Protocol';
import { SecretMasker } from '../secrets/SecretMasker';

/**
 * What a step received and printed, from its trace, for the daemon to record (see {@link StepIoCapture}).
 *
 * A secret is never copied: an input that is one of the step's secrets, and each declared `secrets:` name,
 * is written as its placeholder. The caller still masks the whole capture before it leaves the worker.
 */
export function buildStepIoCapture(step: AssignableStep, trace: StepTrace, context: ExecutionContext): StepIoCapture {
	const inputs: Record<string, string> = {};
	for (const name of referencedInputNames(step)) {
		if (context.secrets !== undefined && name in context.secrets) {
			inputs[`inputs.${name}`] = SecretMasker.placeholder(name);
		} else if (name in context.inputs) {
			inputs[`inputs.${name}`] = context.inputs[name]!;
		}
	}
	for (const [name, value] of Object.entries(trace.env ?? {})) {
		inputs[`env.${name}`] = value;
	}
	if (step.type === 'script') {
		for (const name of step.secrets ?? []) {
			inputs[`secrets.${name}`] = SecretMasker.placeholder(name);
		}
	}
	if (step.type === 'model' && trace.prompt !== undefined) {
		inputs['prompt'] = trace.prompt;
	}
	// A model step's stdout is its final response; the CLI's own stdout is the transport, not the answer.
	const stdout = step.type === 'model' ? trace.response : trace.stdout;
	return {
		inputs,
		...(stdout !== undefined ? { stdout } : {}),
		...(trace.stderr !== undefined ? { stderr: trace.stderr } : {}),
	};
}
