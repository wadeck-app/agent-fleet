import { SecretUsageAnalyzer } from 'flow-engine';
import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import { SecretResolutionError, SecretUnresolvedError, SecretsResolutionFailedError } from './SecretErrors';
import { SecretMasker } from './SecretMasker';
import type { SecretProvider } from './SecretProvider';

/**
 * The secrets of one execution, resolved once before any step starts.
 *
 * Holds values in memory only. Nothing here is ever serialised: the values reach a worker
 * only through {@link valuesForStep}, and only for the steps that use them.
 */
export class ExecutionSecrets {
	private constructor(
		/** Every secret input the flow declares, resolved or not. */
		private readonly declaredNames: ReadonlySet<string>,
		private readonly values: ReadonlyMap<string, string>,
		private readonly namesByStep: ReadonlyMap<string, readonly string[]>,
		/** name -> reference (env://..., file://...). References are not secret; kept for resume. */
		readonly references: ReadonlyMap<string, string>
	) {}

	/**
	 * @throws SecretsResolutionFailedError listing EVERY secret that could not be resolved
	 */
	static resolve(
		flow: FlowDefinition,
		inputs: Readonly<Record<string, string>>,
		provider: SecretProvider
	): ExecutionSecrets {
		const analyzer = new SecretUsageAnalyzer();
		const declarations = analyzer.describe(flow);
		const declaredNames = new Set(declarations.map(declaration => declaration.name));
		const values = new Map<string, string>();
		const references = new Map<string, string>();
		const failures: SecretResolutionError[] = [];

		for (const declaration of declarations) {
			const reference = inputs[declaration.name] ?? declaration.defaultReference;
			const used = declaration.usedBy.length > 0;
			if (reference === undefined) {
				if (used || declaration.required) {
					failures.push(
						new SecretUnresolvedError(
							`Secret '${declaration.name}' was not supplied${used ? ` but step(s) ${declaration.usedBy.join(', ')} use it` : ' and is required'}. ` +
								`Pass a reference with -i ${declaration.name}=env://VARIABLE_NAME or -i ${declaration.name}=file://./path/to/file, ` +
								`or declare a 'default:' reference on the input.`,
							declaration.name
						)
					);
				}
				continue;
			}
			// A secret nobody uses is not resolved: fewer values in memory, nothing to hide.
			if (!used) {
				continue;
			}
			try {
				values.set(declaration.name, provider.resolve(declaration.name, reference).use());
				references.set(declaration.name, reference);
			} catch (error) {
				if (!(error instanceof SecretResolutionError)) {
					throw error;
				}
				failures.push(error);
			}
		}
		if (failures.length > 0) {
			throw new SecretsResolutionFailedError(failures);
		}

		const namesByStep = new Map(
			flow.steps.map(step => [step.id, analyzer.stepSecretNames(step, declaredNames)] as const)
		);
		return new ExecutionSecrets(declaredNames, values, namesByStep, references);
	}

	/** True when the flow declares at least one secret input, used or not. */
	get declaresSecrets(): boolean {
		return this.declaredNames.size > 0;
	}

	/** True when no secret value was resolved (none used). */
	get isEmpty(): boolean {
		return this.values.size === 0;
	}

	/** Re-resolves the same references: a resumed execution picks up rotated values. */
	reResolve(flow: FlowDefinition, provider: SecretProvider): ExecutionSecrets {
		return ExecutionSecrets.resolve(flow, Object.fromEntries(this.references), provider);
	}

	get masker(): SecretMasker {
		return new SecretMasker(this.values);
	}

	/** The values of the secrets this step uses, to send with its assignment. Empty for other steps. */
	valuesForStep(stepId: string): Record<string, string> {
		const entries: Array<[string, string]> = [];
		for (const name of this.namesByStep.get(stepId) ?? []) {
			const value = this.values.get(name);
			if (value !== undefined) {
				entries.push([name, value]);
			}
		}
		return Object.fromEntries(entries);
	}

	/** The run inputs without the secret ones: those never travel with an ordinary assignment. */
	publicInputs(inputs: Readonly<Record<string, string>>): Record<string, string> {
		return Object.fromEntries(Object.entries(inputs).filter(([name]) => !this.declaredNames.has(name)));
	}

	/**
	 * A step injected while the flow runs is not part of the declarations scanned at start, so
	 * it cannot be given a secret: refuse it rather than run it with an empty value.
	 */
	assertInjectable(step: FlowStep): void {
		const used = new SecretUsageAnalyzer().stepSecretNames(step, this.declaredNames);
		if (used.length > 0) {
			throw new Error(
				`Injected step '${step.id}' uses secret(s) ${used.join(', ')}. Only steps declared in the flow file can use secrets: ` +
					`move this step into the flow file.`
			);
		}
	}
}
