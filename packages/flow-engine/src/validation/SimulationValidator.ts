/**
 * Simulation Validator
 *
 * Performs conceptual dry-run validation (no actual execution):
 * - Template rendering simulation
 * - Dependency chain analysis
 * - Execution path analysis
 * - Dead-end output detection
 * - Missing data detection
 *
 * This validator identifies issues that would cause runtime problems but aren't
 * caught by structural or semantic validation.
 */
import type { FlowDefinition, FlowStep } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Simulated step state for path analysis
 * @future This interface is reserved for future advanced path analysis features
 */
// interface SimulatedStepState {
// 	stepId: string;
// 	completed: boolean;
// 	outputs: Set<string>;
// 	conditionallyExecuted: boolean; // Step only runs on some paths
// }

/**
 * Execution path through the flow
 */
interface ExecutionPath {
	steps: string[];
	reachesTerminal: boolean;
	producedOutputs: Map<string, Set<string>>; // stepId -> output names
}

/**
 * Simulation Validator
 */
export class SimulationValidator {
	/**
	 * Create a new SimulationValidator
	 * @param issueCollector - Collector for validation issues
	 */
	constructor(private issueCollector: IssueCollector) {}

	/**
	 * Validate flow through simulation
	 * @param flow - Flow definition to validate
	 * @param stepIds - Set of valid step IDs
	 */
	public validateSimulation(flow: FlowDefinition, _stepIds: Set<string>): void {
		// Analyze dependency chains
		this.analyzeDependencyChains(flow);

		// Analyze execution paths
		this.analyzeExecutionPaths(flow);

		// Detect dead-end outputs
		this.detectDeadEndOutputs(flow);

		// Simulate template rendering
		this.simulateTemplateRendering(flow);
	}

	/**
	 * Analyze dependency chains to find data flow issues
	 */
	private analyzeDependencyChains(flow: FlowDefinition): void {
		// Build step map
		const stepMap = new Map<string, FlowStep>();
		for (const step of flow.steps) {
			stepMap.set(step.id, step);
		}

		// Trace each step's dependency chain
		for (const step of flow.steps) {
			if (step.depends && step.depends.length > 0) {
				this.traceDependencyChain(step, stepMap, new Set(), flow.id);
			}
		}
	}

	/**
	 * Trace dependency chain for a step
	 */
	private traceDependencyChain(
		step: FlowStep,
		stepMap: Map<string, FlowStep>,
		visited: Set<string>,
		flowId: string,
		depth: number = 0
	): void {
		// Warn on very deep dependency chains (>10 levels)
		if (depth > 10) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.UNREACHABLE_STEP,
				message: `Step '${step.id}' has very deep dependency chain (${depth} levels)`,
				location: {
					stepId: step.id,
					field: 'depends',
					path: `${flowId}.steps[${step.id}].depends`,
				},
				suggestion: `Consider simplifying the dependency chain or breaking into subflows`,
				context: {
					actual: depth,
					expected: '< 10 levels',
				},
			});
			return;
		}

		// Check for circular dependencies (shouldn't happen if GraphValidator ran, but double-check)
		if (visited.has(step.id)) {
			return;
		}
		visited.add(step.id);

		// Trace dependencies recursively
		if (step.depends) {
			for (const depId of step.depends) {
				const depStep = stepMap.get(depId);
				if (depStep && depStep.depends) {
					this.traceDependencyChain(depStep, stepMap, visited, flowId, depth + 1);
				}
			}
		}
	}

	/**
	 * Analyze execution paths through the flow
	 */
	private analyzeExecutionPaths(flow: FlowDefinition): void {
		// Find root steps (no dependencies)
		const rootSteps = flow.steps.filter(step => !step.depends || step.depends.length === 0);

		if (rootSteps.length === 0) {
			// This should be caught by GraphValidator, but double-check
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.UNREACHABLE_STEP,
				message: `Flow has no root steps (all steps have dependencies)`,
				location: {
					path: `${flow.id}.steps`,
				},
				suggestion: `Ensure at least one step has no dependencies`,
			});
			return;
		}

		// Find terminal steps (no dependents and no conditionals)
		const dependents = this.buildDependentsMap(flow.steps);
		const terminalSteps = flow.steps.filter(step => {
			const deps = dependents.get(step.id) || new Set();
			return deps.size === 0 && !step.when;
		});

		if (terminalSteps.length === 0) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.NO_TERMINAL_STEP,
				message: `Flow has no guaranteed terminal steps (all steps are conditional or have dependents)`,
				location: {
					path: `${flow.id}.steps`,
				},
				suggestion: `Ensure at least one execution path reaches a terminal step`,
			});
		}

		// Simulate execution paths
		const paths = this.simulateExecutionPaths(flow);

		// Check if all paths reach terminal steps
		const pathsWithoutTerminal = paths.filter(p => !p.reachesTerminal);
		if (pathsWithoutTerminal.length > 0) {
			this.issueCollector.addIssue({
				severity: 'warning',
				code: ValidationCode.NO_TERMINAL_STEP,
				message: `Some execution paths may not reach terminal steps`,
				location: {
					path: `${flow.id}.steps`,
				},
				suggestion: `Review conditional logic to ensure all paths complete`,
				context: {
					actual: `${pathsWithoutTerminal.length} incomplete paths`,
				},
			});
		}
	}

	/**
	 * Build map of dependents (reverse dependencies)
	 */
	private buildDependentsMap(steps: FlowStep[]): Map<string, Set<string>> {
		const dependents = new Map<string, Set<string>>();

		for (const step of steps) {
			if (step.depends) {
				for (const depId of step.depends) {
					if (!dependents.has(depId)) {
						dependents.set(depId, new Set());
					}
					dependents.get(depId)!.add(step.id);
				}
			}
		}

		return dependents;
	}

	/**
	 * Simulate execution paths through the flow
	 */
	private simulateExecutionPaths(flow: FlowDefinition): ExecutionPath[] {
		const paths: ExecutionPath[] = [];
		const stepMap = new Map<string, FlowStep>();

		for (const step of flow.steps) {
			stepMap.set(step.id, step);
		}

		// Find root steps
		const rootSteps = flow.steps.filter(step => !step.depends || step.depends.length === 0);

		// Simulate from each root (simplified - doesn't handle complex branching)
		for (const root of rootSteps) {
			const path: ExecutionPath = {
				steps: [root.id],
				reachesTerminal: !root.when, // Conditional roots may not execute
				producedOutputs: new Map(),
			};

			if (root.output) {
				path.producedOutputs.set(root.id, new Set(Object.keys(root.output)));
			}

			paths.push(path);
		}

		return paths;
	}

	/**
	 * Detect outputs that are produced but never used
	 */
	private detectDeadEndOutputs(flow: FlowDefinition): void {
		// Build map of all produced outputs
		const producedOutputs = new Map<string, Set<string>>();
		for (const step of flow.steps) {
			if (step.output) {
				producedOutputs.set(step.id, new Set(Object.keys(step.output)));
			}
		}

		// Build map of used outputs
		const usedOutputs = new Map<string, Set<string>>();

		for (const step of flow.steps) {
			// Check script/prompt/inputs for step output references
			const text = this.getStepText(step);

			// Extract step output references
			const stepRefPattern = /steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)/g;
			const matches = [...text.matchAll(stepRefPattern)];

			for (const match of matches) {
				const referencedStepId = match[1];
				const referencedOutput = match[2];

				if (!usedOutputs.has(referencedStepId)) {
					usedOutputs.set(referencedStepId, new Set());
				}
				usedOutputs.get(referencedStepId)!.add(referencedOutput);
			}
		}

		// Find unused outputs
		for (const [stepId, outputs] of producedOutputs) {
			const used = usedOutputs.get(stepId) || new Set();

			for (const outputName of outputs) {
				if (!used.has(outputName)) {
					this.issueCollector.addIssue({
						severity: 'info',
						code: ValidationCode.UNUSED_OUTPUT,
						message: `Output '${outputName}' from step '${stepId}' is never used`,
						location: {
							stepId: stepId,
							field: `output.${outputName}`,
							path: `${flow.id}.steps[${stepId}].output.${outputName}`,
						},
						suggestion: `Remove unused output or use it in a subsequent step`,
					});
				}
			}
		}
	}

	/**
	 * Get searchable text from a step
	 */
	private getStepText(step: FlowStep): string {
		let text = '';

		if (step.type === 'model') {
			text += step.prompt;
		} else if (step.type === 'script') {
			text += step.script;
		} else if (step.type === 'subflow') {
			text += JSON.stringify(step.inputs);
		}

		if (step.when) {
			text += step.when;
		}

		if (step.onFailure?.addComment) {
			text += step.onFailure.addComment;
		}

		return text;
	}

	/**
	 * Simulate template rendering to find issues
	 */
	private simulateTemplateRendering(flow: FlowDefinition): void {
		// Check for template expressions that won't work
		for (const step of flow.steps) {
			const text = this.getStepText(step);

			// Detect arithmetic in templates (not supported).
			// Require whitespace on both sides of the operator to avoid false positives
			// on hyphens within identifiers like ${{ steps.analyze-storage.outputs.result }}.
			const arithmeticPattern = /\$\{\{\s*[^}]*\s[+\-*/]\s[^}]*\}\}/g;
			const arithmeticMatches = text.match(arithmeticPattern);

			if (arithmeticMatches) {
				for (const match of arithmeticMatches) {
					this.issueCollector.addIssue({
						severity: 'error',
						code: ValidationCode.INVALID_TEMPLATE_SYNTAX,
						message: `Template expression contains arithmetic which is not supported: ${match}`,
						location: {
							stepId: step.id,
							field: step.type === 'model' ? 'prompt' : 'script',
							path: `${flow.id}.steps[${step.id}]`,
						},
						suggestion: `Move arithmetic to a script step and use the result: set /a result=\${value}+1`,
						context: {
							actual: match,
							expected: 'Simple variable references only (e.g., ${{ inputs.value }})',
						},
					});
				}
			}

			// Detect function calls in templates (not supported)
			const functionPattern = /\$\{\{\s*[^}]*\([^)]*\)\s*\}\}/g;
			const functionMatches = text.match(functionPattern);

			if (functionMatches) {
				for (const match of functionMatches) {
					this.issueCollector.addIssue({
						severity: 'warning',
						code: ValidationCode.INVALID_TEMPLATE_SYNTAX,
						message: `Template expression contains function call which may not work: ${match}`,
						location: {
							stepId: step.id,
							field: step.type === 'model' ? 'prompt' : 'script',
							path: `${flow.id}.steps[${step.id}]`,
						},
						suggestion: `Templates only support property access, not function calls`,
						context: {
							actual: match,
						},
					});
				}
			}

			// Detect nested property access beyond expected depth
			const deepAccessPattern = /\$\{\{\s*\w+\.\w+\.\w+\.\w+\.\w+\s*\}\}/g;
			const deepAccessMatches = text.match(deepAccessPattern);

			if (deepAccessMatches) {
				for (const match of deepAccessMatches) {
					this.issueCollector.addIssue({
						severity: 'warning',
						code: ValidationCode.INVALID_TEMPLATE_SYNTAX,
						message: `Template expression has deep nested property access: ${match}`,
						location: {
							stepId: step.id,
							field: step.type === 'model' ? 'prompt' : 'script',
							path: `${flow.id}.steps[${step.id}]`,
						},
						suggestion: `Consider simplifying or extracting the value in a previous step`,
						context: {
							actual: match,
						},
					});
				}
			}
		}
	}
}
