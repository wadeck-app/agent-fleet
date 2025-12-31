/**
 * Dependency Order Validator
 *
 * Validates that variable references respect the dependency graph:
 * - If stepB uses ${{ steps.stepA.outputs.x }}, then stepB must depend on stepA
 * - Dependency can be direct or transitive
 * - This prevents "time travel" where a step uses data from a step that hasn't executed yet
 *
 * Algorithm:
 * 1. Build transitive dependency map using DFS (O(V+E))
 * 2. Extract all step output references from templates
 * 3. For each reference, check if consumer depends on producer
 */
import type { FlowDefinition, FlowStep, ModelFlowStep, ScriptFlowStep, SubFlowStep } from '../types';
import { type IssueCollector, ValidationCode, type VariableReference } from './ValidationTypes';

export class DependencyOrderValidator {
	constructor(private issueCollector: IssueCollector) {}

	/**
	 * Validate dependency order for all variable references
	 */
	public validateDependencyOrder(flow: FlowDefinition): void {
		// Build transitive dependency map (stepId → Set<ancestorStepIds>)
		const dependencyMap = this.buildTransitiveDependencyMap(flow.steps);

		// Extract all variable references
		const references = this.extractStepOutputReferences(flow);

		// Validate each reference
		for (const ref of references) {
			this.validateReference(ref, dependencyMap);
		}
	}

	/**
	 * Build transitive dependency map using DFS
	 * For each step, compute the set of all steps it (transitively) depends on
	 */
	private buildTransitiveDependencyMap(steps: FlowStep[]): Map<string, Set<string>> {
		const directDeps = new Map<string, Set<string>>();
		const transitiveDeps = new Map<string, Set<string>>();

		// Build direct dependency map
		for (const step of steps) {
			directDeps.set(step.id, new Set(step.depends || []));
		}

		// Compute transitive closure using DFS for each step
		for (const step of steps) {
			const visited = new Set<string>();
			this.computeTransitiveDeps(step.id, directDeps, visited);
			transitiveDeps.set(step.id, visited);
		}

		return transitiveDeps;
	}

	/**
	 * DFS to compute transitive dependencies
	 */
	private computeTransitiveDeps(stepId: string, directDeps: Map<string, Set<string>>, visited: Set<string>): void {
		const deps = directDeps.get(stepId) || new Set();
		for (const depId of deps) {
			if (!visited.has(depId)) {
				visited.add(depId);
				this.computeTransitiveDeps(depId, directDeps, visited);
			}
		}
	}

	/**
	 * Extract all step output references (steps.*.outputs.*)
	 */
	private extractStepOutputReferences(flow: FlowDefinition): VariableReference[] {
		const references: VariableReference[] = [];
		const templateRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;

		for (const step of flow.steps) {
			const texts = this.getTemplateTexts(step);

			for (const { text, field } of texts) {
				let match;
				while ((match = templateRegex.exec(text)) !== null) {
					const expression = match[1].trim();
					const parsed = this.parseVariableExpression(expression);

					// Only care about step output references
					if (parsed && parsed.type === 'step') {
						references.push({
							expression,
							type: 'step',
							path: parsed.path,
							location: {
								stepId: step.id,
								field,
							},
						});
					}
				}
			}
		}

		return references;
	}

	/**
	 * Get template texts from a step based on its type
	 */
	private getTemplateTexts(step: FlowStep): Array<{ text: string; field: string }> {
		const texts: Array<{ text: string; field: string }> = [];

		if (step.type === 'model') {
			const modelStep = step as ModelFlowStep;
			if (modelStep.prompt) {
				texts.push({ text: modelStep.prompt, field: 'prompt' });
			}
		} else if (step.type === 'script') {
			const scriptStep = step as ScriptFlowStep;
			if (scriptStep.script) {
				texts.push({ text: scriptStep.script, field: 'script' });
			}
		} else if (step.type === 'subflow') {
			const subflowStep = step as SubFlowStep;
			// Combine all input values
			if (subflowStep.inputs) {
				const combinedInputs = Object.values(subflowStep.inputs).join(' ');
				texts.push({ text: combinedInputs, field: 'inputs' });
			}
		}

		// Also check 'when' condition if present
		if (step.when) {
			texts.push({ text: step.when, field: 'when' });
		}

		return texts;
	}

	/**
	 * Parse variable expression
	 */
	private parseVariableExpression(expression: string): { type: 'input' | 'step' | 'task'; path: string[] } | null {
		const parts = expression.split('.');
		if (parts[0] === 'inputs') {
			return { type: 'input', path: parts.slice(1) };
		} else if (parts[0] === 'steps') {
			return { type: 'step', path: parts.slice(1) };
		} else if (parts[0] === 'task') {
			return { type: 'task', path: parts.slice(1) };
		}
		return null;
	}

	/**
	 * Validate that consuming step depends on producing step
	 */
	private validateReference(ref: VariableReference, dependencyMap: Map<string, Set<string>>): void {
		const consumerStepId = ref.location.stepId!;
		const producerStepId = ref.path[0]; // steps.producerStepId.outputs.varName

		// Get transitive dependencies of consumer
		const dependencies = dependencyMap.get(consumerStepId) || new Set();

		// Check if producer is in dependency chain
		if (!dependencies.has(producerStepId)) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.UNDEFINED_VARIABLE,
				message: `Step '${consumerStepId}' uses variable from '${producerStepId}' but does not depend on it`,
				location: ref.location,
				suggestion: `Add '${producerStepId}' to the 'depends' array of '${consumerStepId}' (directly or transitively)`,
				context: {
					actual: consumerStepId,
					expected: producerStepId,
					related: Array.from(dependencies),
				},
			});
		}
	}
}
