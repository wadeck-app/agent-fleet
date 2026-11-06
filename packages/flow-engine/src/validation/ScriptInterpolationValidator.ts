import { TemplateEscape } from '../processing/TemplateEscape';
import type { FlowDefinition } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Warns when a value of untrusted origin is interpolated into a `script:` body.
 *
 * `${{ ... }}` is raw text substitution: the shell then parses the result, so a value holding `$(...)`,
 * backticks, quotes or `;` is executed (or mangled). The same value passed through `env:` stays data.
 *
 * Untrusted: `inputs.X` (any type that can carry text; number-like and boolean inputs cannot carry shell syntax,
 * `password` inputs have their own rule) and `steps.X.outputs...` of a non-script step (model, user, subflow, event).
 * Trusted: outputs of script steps (authored code), `context.*`, `task.*`, and everything inside `env:` values.
 * It is a warning, not an error: existing flows interpolate paths and flags on purpose.
 */
export class ScriptInterpolationValidator {
	private static readonly SAFE_INPUT_TYPES: ReadonlySet<string> = new Set([
		'number',
		'integer',
		'boolean',
		'percentage',
		'password',
	]);

	private static readonly EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;

	private static readonly INPUT_REFERENCE = /(?<![\w.])inputs\.([A-Za-z_][A-Za-z0-9_-]*)/g;

	private static readonly STEP_REFERENCE = /(?<![\w.])steps\.([A-Za-z_][A-Za-z0-9_-]*)\.outputs\.[A-Za-z0-9_.-]*/g;

	constructor(private readonly issueCollector: IssueCollector) {}

	public validate(flow: FlowDefinition): void {
		const steps = (Array.isArray(flow.steps) ? flow.steps : []).filter(
			(step): step is NonNullable<typeof step> => typeof step === 'object' && step !== null
		);
		const typeById = new Map(steps.map(step => [step.id, step.type]));
		for (const step of steps) {
			const body = (step as { script?: unknown }).script;
			if (step.type !== 'script' || typeof body !== 'string') {
				continue;
			}
			for (const reference of this.untrustedReferences(body, flow, typeById)) {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.SCRIPT_BODY_INTERPOLATION,
					message: `Script of step '${step.id}' interpolates '${reference}' into its text: the shell parses the substituted value, so quotes, $(...), backticks or ; in it are executed or lost`,
					location: { stepId: step.id, field: 'script' },
					suggestion:
						"Pass it through env: and reference $NAME in the script (for example env: { NAME: '${{ " +
						reference +
						" }}' }); interpolate only values you control, such as a path or a flag",
				});
			}
		}
	}

	private untrustedReferences(body: string, flow: FlowDefinition, typeById: Map<string, string>): string[] {
		const found = new Set<string>();
		const text = TemplateEscape.strip(body);
		for (const [, expression] of text.matchAll(ScriptInterpolationValidator.EXPRESSION)) {
			for (const [, name] of expression.matchAll(ScriptInterpolationValidator.INPUT_REFERENCE)) {
				if (!ScriptInterpolationValidator.SAFE_INPUT_TYPES.has(this.inputType(flow, name))) {
					found.add(`inputs.${name}`);
				}
			}
			for (const [reference, stepId] of expression.matchAll(ScriptInterpolationValidator.STEP_REFERENCE)) {
				const type = typeById.get(stepId);
				if (type !== undefined && type !== 'script') {
					found.add(reference);
				}
			}
		}
		return [...found];
	}

	private inputType(flow: FlowDefinition, name: string): string {
		const spec: unknown = flow.inputs?.[name];
		const type = typeof spec === 'string' ? spec : (spec as { type?: unknown } | null | undefined)?.type;
		// An undeclared (auto-discovered) input is a string
		return typeof type === 'string' ? type : 'string';
	}
}
