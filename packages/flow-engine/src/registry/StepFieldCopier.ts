import type { ModelFlowStep, ScriptFlowStep, SubFlowStep, UserInterventionStep } from '../types';

/**
 * One entry per property of a step kind (except the `type` discriminator). The type forces the list to match
 * the interface exactly: adding a field to a step type without listing it here (or listing a field that does
 * not exist) is a compile error, so a loaded step cannot silently drop a new field.
 */
type FieldList<Step> = { readonly [Field in keyof Omit<Step, 'type'>]-?: true };

export const MODEL_STEP_FIELDS: FieldList<ModelFlowStep> = {
	id: true,
	name: true,
	context: true,
	output: true,
	depends: true,
	labels: true,
	when: true,
	skipOnLoop: true,
	retry: true,
	onFailure: true,
	contract: true,
	parent: true,
	maxSubStepIterations: true,
	subStepStrategy: true,
	wave: true,
	provider: true,
	model: true,
	env: true,
	prompt: true,
	log: true,
	toolLog: true,
	subStepFeedbackPrompt: true,
	session: true,
	mcpServers: true,
	toolHooks: true,
	tools: true,
	skipPermissions: true,
	contextLimit: true,
	onCompact: true,
	permission: true,
	timeout: true,
};

export const SCRIPT_STEP_FIELDS: FieldList<ScriptFlowStep> = {
	id: true,
	name: true,
	context: true,
	output: true,
	depends: true,
	labels: true,
	when: true,
	skipOnLoop: true,
	retry: true,
	onFailure: true,
	contract: true,
	parent: true,
	maxSubStepIterations: true,
	subStepStrategy: true,
	wave: true,
	script: true,
	workingDir: true,
	env: true,
	captureOutput: true,
	shell: true,
	strict: true,
	timeout: true,
	secrets: true,
};

export const SUBFLOW_STEP_FIELDS: FieldList<SubFlowStep> = {
	id: true,
	name: true,
	context: true,
	output: true,
	depends: true,
	labels: true,
	when: true,
	skipOnLoop: true,
	retry: true,
	onFailure: true,
	contract: true,
	parent: true,
	maxSubStepIterations: true,
	subStepStrategy: true,
	wave: true,
	flowId: true,
	inputs: true,
	workspaceStrategy: true,
	allowRecursion: true,
};

export const USER_INTERVENTION_STEP_FIELDS: FieldList<UserInterventionStep> = {
	id: true,
	name: true,
	context: true,
	output: true,
	depends: true,
	labels: true,
	when: true,
	skipOnLoop: true,
	retry: true,
	onFailure: true,
	contract: true,
	parent: true,
	maxSubStepIterations: true,
	subStepStrategy: true,
	wave: true,
	interventionType: true,
	blocking: true,
	timeout: true,
	approval: true,
	question: true,
	choice: true,
};

/** Copies the listed fields that the raw step defines; absent ones stay absent (no `undefined` keys). */
export function copyStepFields(
	fields: Readonly<Record<string, true>>,
	raw: Readonly<Record<string, unknown>>
): Record<string, unknown> {
	const copy: Record<string, unknown> = {};
	for (const field of Object.keys(fields)) {
		if (raw[field] !== undefined) {
			copy[field] = raw[field];
		}
	}
	return copy;
}
