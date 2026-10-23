import { SecretUsageAnalyzer } from '../secrets/SecretUsageAnalyzer';
import type { FlowDefinition, FlowStep } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Validates `type: password` inputs and the steps that use them.
 * Runs right after schema validation. Messages never contain a default value (it may be a pasted secret).
 */
export class SecretValidator {
	private static readonly REFERENCE_HELP =
		'Use env://VARIABLE_NAME (read from the daemon environment) or file://relative/path (relative to the run directory), or remove the default and pass it at run time: flow run <flow> -i NAME=file://./path';

	constructor(
		private readonly issueCollector: IssueCollector,
		private readonly analyzer: SecretUsageAnalyzer = new SecretUsageAnalyzer()
	) {}

	public validateSecrets(flow: FlowDefinition): void {
		const secretNames = this.analyzer.secretInputNames(flow);
		this.validateInputs(flow, secretNames);
		this.validateFlowEnv(flow, secretNames);
		for (const step of Array.isArray(flow.steps) ? flow.steps : []) {
			if (typeof step === 'object' && step !== null) {
				this.validateStep(step, secretNames);
			}
		}
	}

	private validateInputs(flow: FlowDefinition, secretNames: string[]): void {
		for (const name of secretNames) {
			if (!SecretUsageAnalyzer.NAME_PATTERN.test(name)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.SECRET_INVALID_NAME,
					message: `Secret input '${name}' cannot be used as an environment variable name`,
					location: { field: `inputs.${name}` },
					suggestion: 'Rename the input so that it matches [A-Za-z_][A-Za-z0-9_]* (for example API_TOKEN)',
				});
			}
			const spec = flow.inputs[name];
			const defaultValue = typeof spec === 'object' && spec !== null ? spec.default : undefined;
			if (defaultValue !== undefined && !this.isValidReference(defaultValue)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.SECRET_BAD_REFERENCE,
					message: `Secret input '${name}' has a default that is not an env:// or file:// reference (the value is not shown)`,
					location: { field: `inputs.${name}.default` },
					suggestion: SecretValidator.REFERENCE_HELP,
				});
			}
		}
	}

	private isValidReference(value: unknown): boolean {
		if (typeof value !== 'string') {
			return false;
		}
		if (value.startsWith('env://')) {
			return SecretUsageAnalyzer.NAME_PATTERN.test(value.slice('env://'.length));
		}
		if (value.startsWith('file://')) {
			const target = value.slice('file://'.length);
			return (
				target.length > 0 &&
				!target.startsWith('/') &&
				!target.startsWith('\\') &&
				!/^[A-Za-z]:/.test(target) &&
				!target.split(/[\\/]/).includes('..')
			);
		}
		return false;
	}

	private validateFlowEnv(flow: FlowDefinition, secretNames: string[]): void {
		for (const [key, value] of Object.entries(flow.env ?? {})) {
			for (const name of this.analyzer.referencedInputNamesIn(value)) {
				if (secretNames.includes(name)) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.SECRET_FORBIDDEN_STEP,
						message: `Flow env '${key}' references secret input '${name}': flow env is injected into every step, including model steps`,
						location: { field: `env.${key}` },
						suggestion: `Remove it from the flow env and give it only to the script step that needs it: secrets: [${name}]`,
					});
				}
			}
		}
	}

	private validateStep(step: FlowStep, secretNames: string[]): void {
		const explicit = (step as { secrets?: unknown }).secrets;
		if (explicit !== undefined) {
			this.validateExplicit(step, explicit, secretNames);
		}
		if (step.type === 'script') {
			this.validateScriptText(step, secretNames);
			return;
		}
		for (const name of this.analyzer.referencedInputNames(step)) {
			if (secretNames.includes(name)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.SECRET_FORBIDDEN_STEP,
					message: `Step '${step.id}' (${step.type}) references secret input '${name}': its value would be exposed to the model, the person or the other flow`,
					location: { stepId: step.id },
					suggestion: `Use the secret in a script step with secrets: [${name}] and read $${name}, and pass only the derived result to this step`,
				});
			}
		}
	}

	private validateExplicit(step: FlowStep, explicit: unknown, secretNames: string[]): void {
		if (step.type !== 'script') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.SECRET_FORBIDDEN_STEP,
				message: `Step '${step.id}' is a ${step.type} step: only script steps can declare secrets:`,
				location: { stepId: step.id, field: 'secrets' },
				suggestion:
					'Remove secrets: from this step and use the secret in a script step instead (secrets: [NAME])',
			});
			return;
		}
		if (!Array.isArray(explicit) || explicit.some(entry => typeof entry !== 'string')) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_TYPE,
				message: `Step '${step.id}' has a secrets: value that is not a list of input names`,
				location: { stepId: step.id, field: 'secrets' },
				suggestion: 'Write a list of type: password input names, for example secrets: [API_TOKEN]',
			});
			return;
		}
		for (const name of explicit as string[]) {
			if (!secretNames.includes(name)) {
				this.issueCollector.addIssue({
					severity: 'error',
					code: ValidationCode.SECRET_UNKNOWN,
					message: `Step '${step.id}' lists secret '${name}' which is not a declared type: password input`,
					location: { stepId: step.id, field: 'secrets' },
					suggestion: `Declare it under inputs: with type: password (${name}: password) or fix the name. Declared secrets: ${secretNames.join(', ') || '(none)'}`,
					context: { actual: name, related: secretNames },
				});
			}
		}
	}

	private validateScriptText(step: FlowStep, secretNames: string[]): void {
		const script = (step as { script?: unknown }).script;
		for (const name of this.analyzer.referencedInputNamesIn(script)) {
			if (secretNames.includes(name)) {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.SECRET_IN_SCRIPT_TEXT,
					message: `Script of step '${step.id}' embeds secret input '${name}' in its text: command lines are visible to other local processes`,
					location: { stepId: step.id, field: 'script' },
					suggestion: `Add secrets: [${name}] to the step and use $${name} in the script instead of the template`,
				});
			}
		}
	}
}
