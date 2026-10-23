import { TemplateEscape } from '../processing/TemplateEscape';
import type { FlowDefinition, FlowStep } from '../types';

export type SecretSourceKind = 'env' | 'file' | 'run-time';

export interface SecretDeclaration {
	name: string;
	description?: string;
	required: boolean;
	/** The `default:` reference (env:// or file://) when one is declared. Never a value. */
	defaultReference?: string;
	sourceKind: SecretSourceKind;
	/** Ids of the steps that receive this secret. */
	usedBy: string[];
}

/**
 * Pure static analysis of `type: password` inputs: which are declared, which steps use them.
 * A step uses a secret when it lists it in `secrets:` or references `inputs.NAME` in a template.
 */
export class SecretUsageAnalyzer {
	/** A secret name becomes an environment variable name. */
	public static readonly NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

	private static readonly REGION_PATTERNS = [/\$\{\{([\s\S]*?)\}\}/g, /\{%([\s\S]*?)%\}/g];

	private static readonly INPUT_REFERENCE = /(?<![\w.])inputs\.([A-Za-z_][A-Za-z0-9_]*)/g;

	/** Names of the inputs whose type is `password` (shorthand string or `{ type }`). */
	public secretInputNames(flow: FlowDefinition): string[] {
		const names: string[] = [];
		for (const [name, spec] of Object.entries(flow.inputs ?? {})) {
			const type = typeof spec === 'string' ? spec : (spec as { type?: unknown } | null)?.type;
			if (type === 'password') {
				names.push(name);
			}
		}
		return names;
	}

	/** Names X found as `inputs.X` inside template regions of any string leaf of the step. */
	public referencedInputNames(step: FlowStep): string[] {
		const found = new Set<string>();
		for (const [key, value] of Object.entries(step)) {
			if (key === 'secrets') {
				continue;
			}
			this.collect(value, found);
		}
		return [...found];
	}

	/** Same scan as {@link referencedInputNames} for any value (a string, a list, a map such as flow `env`). */
	public referencedInputNamesIn(value: unknown): string[] {
		const found = new Set<string>();
		this.collect(value, found);
		return [...found];
	}

	/** Explicit `secrets:` entries plus referenced secret inputs, sorted and deduplicated. */
	public stepSecretNames(step: FlowStep, secretNames: ReadonlySet<string>): string[] {
		const names = new Set<string>();
		const explicit = (step as { secrets?: unknown }).secrets;
		if (Array.isArray(explicit)) {
			for (const entry of explicit) {
				if (typeof entry === 'string') {
					names.add(entry);
				}
			}
		}
		for (const name of this.referencedInputNames(step)) {
			if (secretNames.has(name)) {
				names.add(name);
			}
		}
		return [...names].sort();
	}

	/** One declaration per password input, sorted by name. */
	public describe(flow: FlowDefinition): SecretDeclaration[] {
		const secretNames = new Set(this.secretInputNames(flow));
		const usage = flow.steps.map(step => ({
			id: step.id,
			names: new Set(this.stepSecretNames(step, secretNames)),
		}));
		return [...secretNames].sort().map(name => this.declare(flow, name, usage));
	}

	private declare(
		flow: FlowDefinition,
		name: string,
		usage: Array<{ id: string; names: Set<string> }>
	): SecretDeclaration {
		const spec = flow.inputs[name];
		const definition = typeof spec === 'object' && spec !== null ? spec : undefined;
		const reference = typeof definition?.default === 'string' ? definition.default : undefined;
		const declaration: SecretDeclaration = {
			name,
			required: definition?.required ?? false,
			sourceKind: this.sourceKind(reference),
			usedBy: usage.filter(entry => entry.names.has(name)).map(entry => entry.id),
		};
		if (definition?.description !== undefined) {
			declaration.description = definition.description;
		}
		if (reference !== undefined) {
			declaration.defaultReference = reference;
		}
		return declaration;
	}

	private sourceKind(reference: string | undefined): SecretSourceKind {
		if (reference?.startsWith('env://')) {
			return 'env';
		}
		if (reference?.startsWith('file://')) {
			return 'file';
		}
		return 'run-time';
	}

	private collect(value: unknown, found: Set<string>): void {
		if (typeof value === 'string') {
			this.scanText(value, found);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				this.collect(item, found);
			}
			return;
		}
		if (value !== null && typeof value === 'object') {
			for (const item of Object.values(value)) {
				this.collect(item, found);
			}
		}
	}

	private scanText(text: string, found: Set<string>): void {
		const unescaped = TemplateEscape.strip(text);
		for (const pattern of SecretUsageAnalyzer.REGION_PATTERNS) {
			for (const region of unescaped.matchAll(new RegExp(pattern.source, pattern.flags))) {
				for (const match of region[1].matchAll(new RegExp(SecretUsageAnalyzer.INPUT_REFERENCE.source, 'g'))) {
					found.add(match[1]);
				}
			}
		}
	}
}
