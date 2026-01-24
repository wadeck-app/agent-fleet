/**
 * Flow Analyzer
 *
 * Analyzes existing flows to understand their capabilities and structure.
 * Provides methods for:
 * - Extracting flow capabilities (purpose, inputs, outputs, patterns)
 * - Identifying structural patterns (linear, diamond, fan-out, etc.)
 * - Calculating complexity scores
 * - Finding similar flows based on capabilities
 *
 * Used by FlowRecommendationEngine to match ideas with existing flows.
 */
import type { FlowDefinition, FlowStep, InputSpec, NormalizedInputDefinition, VariableType } from '../types';

/**
 * Flow pattern types
 */
export type FlowPattern =
	| 'linear-pipeline' // A → B → C (sequential)
	| 'diamond' // A → {B,C} → D (fork-join)
	| 'fan-out' // A → {B,C,D} (parallel, no join)
	| 'fan-out-fan-in' // A → {B,C,D} → E (parallel with aggregation)
	| 'conditional' // A → B if X, C if Y (branching)
	| 'retry-loop' // A → B → fail → A (feedback loop)
	| 'etl-pipeline' // Extract → Transform → Load
	| 'build-pipeline' // checkout → build → test → deploy
	| 'subflow-composition' // Uses subflows as building blocks
	| 'recursive' // Flow calls itself
	| 'user-intervention'; // Contains approval/question steps

/**
 * Input signature extracted from flow
 */
export interface InputSignature {
	/** Input variable name */
	name: string;

	/** Variable type */
	type: VariableType;

	/** Whether this input is required */
	required: boolean;

	/** Description of the input */
	description?: string;
}

/**
 * Output signature extracted from flow steps
 */
export interface OutputSignature {
	/** Output variable name */
	name: string;

	/** Variable type */
	type: VariableType;

	/** Step that produces this output */
	stepId: string;
}

/**
 * Capabilities of a flow
 */
export interface FlowCapabilities {
	/** Flow identifier */
	id: string;

	/** Flow purpose extracted from description */
	purpose: string;

	/** Identified patterns in the flow */
	patterns: FlowPattern[];

	/** Input requirements */
	inputs: InputSignature[];

	/** Output signatures */
	outputs: OutputSignature[];

	/** Complexity score (1-10) */
	complexity: number;

	/** Auto-extracted keywords from description */
	tags: string[];

	/** Number of steps */
	stepCount: number;

	/** Whether flow uses workspace isolation */
	isolated: boolean;

	/** Whether flow uses subflows */
	usesSubflows: boolean;

	/** Whether flow has user intervention */
	requiresApproval: boolean;
}

/**
 * Flow Analyzer
 */
export class FlowAnalyzer {
	/**
	 * Analyze a flow definition to extract its capabilities
	 * @param flow - Flow definition to analyze
	 * @returns Flow capabilities
	 */
	public analyzeFlow(flow: FlowDefinition): FlowCapabilities {
		const patterns = this.identifyPatterns(flow);
		const inputs = this.extractInputSignatures(flow);
		const outputs = this.extractOutputSignatures(flow);
		const complexity = this.calculateComplexity(flow);
		const tags = this.extractTags(flow);

		return {
			id: flow.id,
			purpose: flow.description || flow.name,
			patterns,
			inputs,
			outputs,
			complexity,
			tags,
			stepCount: flow.steps.length,
			isolated: flow.workspace.mode === 'isolated',
			usesSubflows: flow.steps.some(s => s.type === 'subflow'),
			requiresApproval: flow.steps.some(s => s.type === 'user_intervention'),
		};
	}

	/**
	 * Find flows similar to the given capabilities
	 * @param targetCapabilities - Capabilities to match
	 * @param allFlows - All available flows
	 * @returns Sorted array of flows by similarity score (highest first)
	 */
	public findSimilarFlows(
		targetCapabilities: FlowCapabilities,
		allFlows: FlowDefinition[]
	): Array<{
		flow: FlowDefinition;
		similarityScore: number;
		matchedPatterns: FlowPattern[];
		matchedTags: string[];
	}> {
		const results = allFlows
			.filter(f => f.id !== targetCapabilities.id) // Exclude self
			.map(flow => {
				const capabilities = this.analyzeFlow(flow);
				const score = this.calculateSimilarity(targetCapabilities, capabilities);
				const matchedPatterns = this.getMatchedPatterns(targetCapabilities.patterns, capabilities.patterns);
				const matchedTags = this.getMatchedTags(targetCapabilities.tags, capabilities.tags);

				return {
					flow,
					similarityScore: score,
					matchedPatterns,
					matchedTags,
				};
			})
			.filter(r => r.similarityScore > 0)
			.sort((a, b) => b.similarityScore - a.similarityScore);

		return results;
	}

	/**
	 * Identify structural patterns in a flow
	 */
	private identifyPatterns(flow: FlowDefinition): FlowPattern[] {
		const patterns: FlowPattern[] = [];

		// Build dependency graph
		const graph = this.buildDependencyGraph(flow.steps);

		// Check for recursive pattern
		if (flow.steps.some(s => s.type === 'subflow' && s.flowId === flow.id)) {
			patterns.push('recursive');
		}

		// Check for user intervention
		if (flow.steps.some(s => s.type === 'user_intervention')) {
			patterns.push('user-intervention');
		}

		// Check for subflow composition
		if (flow.steps.some(s => s.type === 'subflow')) {
			patterns.push('subflow-composition');
		}

		// Check for retry loop (onFailure.goto)
		if (flow.steps.some(s => s.onFailure?.goto)) {
			patterns.push('retry-loop');
		}

		// Check for conditional branching
		if (flow.steps.some(s => s.when)) {
			patterns.push('conditional');
		}

		// Check for ETL pattern (extract, transform, load keywords)
		const etlKeywords = ['extract', 'transform', 'load', 'etl'];
		if (this.hasKeywords(flow, etlKeywords)) {
			patterns.push('etl-pipeline');
		}

		// Check for build pipeline pattern
		const buildKeywords = ['checkout', 'build', 'test', 'deploy', 'compile'];
		if (this.hasKeywords(flow, buildKeywords)) {
			patterns.push('build-pipeline');
		}

		// Analyze graph structure
		const structuralPattern = this.identifyStructuralPattern(graph);
		if (structuralPattern && !patterns.includes(structuralPattern)) {
			patterns.push(structuralPattern);
		}

		return patterns;
	}

	/**
	 * Build dependency graph from steps
	 */
	private buildDependencyGraph(steps: FlowStep[]): Map<string, Set<string>> {
		const graph = new Map<string, Set<string>>();

		for (const step of steps) {
			if (!graph.has(step.id)) {
				graph.set(step.id, new Set());
			}

			if (step.depends && step.depends.length > 0) {
				for (const depId of step.depends) {
					graph.get(step.id)!.add(depId);
				}
			}
		}

		return graph;
	}

	/**
	 * Identify structural pattern from dependency graph
	 */
	private identifyStructuralPattern(graph: Map<string, Set<string>>): FlowPattern | null {
		const steps = Array.from(graph.keys());

		// Find root nodes (no dependencies)
		const roots = steps.filter(id => graph.get(id)!.size === 0);

		// Find leaf nodes (not depended on by anyone)
		const dependents = new Map<string, Set<string>>();
		for (const [stepId, deps] of graph.entries()) {
			for (const depId of deps) {
				if (!dependents.has(depId)) {
					dependents.set(depId, new Set());
				}
				dependents.get(depId)!.add(stepId);
			}
		}
		const leaves = steps.filter(id => !dependents.has(id) || dependents.get(id)!.size === 0);

		// Linear pipeline: single root, single leaf, all steps in chain
		if (roots.length === 1 && leaves.length === 1 && this.isLinearChain(graph, steps)) {
			return 'linear-pipeline';
		}

		// Fan-out: single root, multiple leaves
		if (roots.length === 1 && leaves.length > 1) {
			return 'fan-out';
		}

		// Diamond: single root, multiple middle, single leaf
		if (roots.length === 1 && leaves.length === 1 && steps.length > 2) {
			// Check if there are parallel paths
			const hasParallelPaths = this.hasParallelPaths(graph, dependents);
			if (hasParallelPaths) {
				return 'diamond';
			}
		}

		// Fan-out-fan-in: multiple parallel branches that converge
		if (roots.length === 1 && leaves.length === 1 && steps.length > 3) {
			return 'fan-out-fan-in';
		}

		return null;
	}

	/**
	 * Check if graph is a linear chain
	 */
	private isLinearChain(graph: Map<string, Set<string>>, steps: string[]): boolean {
		for (const stepId of steps) {
			const deps = graph.get(stepId)!;
			if (deps.size > 1) {
				return false; // Multiple dependencies = not linear
			}
		}
		return true;
	}

	/**
	 * Check if graph has parallel paths
	 */
	private hasParallelPaths(graph: Map<string, Set<string>>, dependents: Map<string, Set<string>>): boolean {
		// Check if any step has multiple dependents (fork point)
		for (const deps of dependents.values()) {
			if (deps.size > 1) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if flow contains specific keywords
	 */
	private hasKeywords(flow: FlowDefinition, keywords: string[]): boolean {
		const text = (flow.name + ' ' + flow.description + ' ' + flow.steps.map(s => s.name).join(' ')).toLowerCase();
		return keywords.some(keyword => text.includes(keyword.toLowerCase()));
	}

	/**
	 * Extract input signatures from flow
	 */
	private extractInputSignatures(flow: FlowDefinition): InputSignature[] {
		const inputs: InputSignature[] = [];

		// Use auto-discovered inputs if available, otherwise use explicit inputs
		const inputsToAnalyze = flow._autoDiscoveredInputs || this.normalizeInputs(flow.inputs);

		for (const [name, spec] of Object.entries(inputsToAnalyze)) {
			inputs.push({
				name,
				type: spec.type,
				required: spec.required,
				description: spec.description,
			});
		}

		return inputs;
	}

	/**
	 * Normalize inputs to NormalizedInputDefinition format
	 */
	private normalizeInputs(inputs: Record<string, InputSpec>): Record<string, NormalizedInputDefinition> {
		const normalized: Record<string, NormalizedInputDefinition> = {};

		for (const [name, spec] of Object.entries(inputs)) {
			if (typeof spec === 'string') {
				// Shorthand: just type
				normalized[name] = {
					type: spec,
					required: false,
					source: 'explicit',
				};
			} else {
				// Extended: full definition
				normalized[name] = {
					type: spec.type,
					required: spec.required ?? false,
					default: spec.default,
					description: spec.description,
					options: spec.options,
					source: 'explicit',
				};
			}
		}

		return normalized;
	}

	/**
	 * Extract output signatures from flow steps
	 */
	private extractOutputSignatures(flow: FlowDefinition): OutputSignature[] {
		const outputs: OutputSignature[] = [];

		for (const step of flow.steps) {
			if (step.output) {
				for (const [name, config] of Object.entries(step.output)) {
					// Handle both OutputVariableConfig and string template (for SubFlowStep)
					if (typeof config === 'object' && 'type' in config) {
						outputs.push({
							name,
							type: config.type,
							stepId: step.id,
						});
					}
				}
			}
		}

		return outputs;
	}

	/**
	 * Calculate flow complexity score (1-10)
	 */
	private calculateComplexity(flow: FlowDefinition): number {
		let score = 0;

		// Base score from step count
		score += Math.min(flow.steps.length, 5); // 1-5 points

		// Add points for different step types
		const stepTypes = new Set(flow.steps.map(s => s.type));
		score += stepTypes.size * 0.5; // 0.5 point per unique step type

		// Add points for complexity features
		if (flow.steps.some(s => s.depends && s.depends.length > 1)) score += 1; // Multiple dependencies
		if (flow.steps.some(s => s.when)) score += 1; // Conditional execution
		if (flow.steps.some(s => s.onFailure?.goto)) score += 1; // Retry loops
		if (flow.steps.some(s => s.type === 'subflow')) score += 1; // Subflows
		if (flow.steps.some(s => s.type === 'user_intervention')) score += 0.5; // User intervention

		// Normalize to 1-10 scale
		return Math.min(Math.max(Math.round(score), 1), 10);
	}

	/**
	 * Extract tags from flow description
	 */
	private extractTags(flow: FlowDefinition): string[] {
		const text = (flow.name + ' ' + flow.description).toLowerCase();
		const tags: string[] = [];

		// Common task keywords
		const keywords = [
			'test',
			'build',
			'deploy',
			'implement',
			'fix',
			'refactor',
			'analyze',
			'review',
			'approve',
			'validate',
			'transform',
			'extract',
			'load',
			'pipeline',
			'automation',
			'ci/cd',
			'data',
			'code',
			'documentation',
			'security',
			'performance',
		];

		for (const keyword of keywords) {
			if (text.includes(keyword)) {
				tags.push(keyword);
			}
		}

		return tags;
	}

	/**
	 * Calculate similarity score between two flow capabilities (0-100)
	 */
	private calculateSimilarity(target: FlowCapabilities, candidate: FlowCapabilities): number {
		let score = 0;

		// Pattern matching (40 points max)
		const matchedPatterns = this.getMatchedPatterns(target.patterns, candidate.patterns);
		score += (matchedPatterns.length / Math.max(target.patterns.length, 1)) * 40;

		// Tag matching (30 points max)
		const matchedTags = this.getMatchedTags(target.tags, candidate.tags);
		score += (matchedTags.length / Math.max(target.tags.length, 1)) * 30;

		// Input signature matching (15 points max)
		const inputMatch = this.calculateInputMatch(target.inputs, candidate.inputs);
		score += inputMatch * 15;

		// Complexity similarity (10 points max)
		const complexityDiff = Math.abs(target.complexity - candidate.complexity);
		score += Math.max(0, 10 - complexityDiff);

		// Feature matching (5 points max)
		if (target.isolated === candidate.isolated) score += 2;
		if (target.usesSubflows === candidate.usesSubflows) score += 2;
		if (target.requiresApproval === candidate.requiresApproval) score += 1;

		return Math.round(score);
	}

	/**
	 * Get matched patterns between two lists
	 */
	private getMatchedPatterns(target: FlowPattern[], candidate: FlowPattern[]): FlowPattern[] {
		return target.filter(p => candidate.includes(p));
	}

	/**
	 * Get matched tags between two lists
	 */
	private getMatchedTags(target: string[], candidate: string[]): string[] {
		return target.filter(t => candidate.includes(t));
	}

	/**
	 * Calculate input signature match (0-1)
	 */
	private calculateInputMatch(target: InputSignature[], candidate: InputSignature[]): number {
		if (target.length === 0) return 1; // No requirements = perfect match

		let matches = 0;
		for (const targetInput of target) {
			const candidateInput = candidate.find(i => i.name === targetInput.name && i.type === targetInput.type);
			if (candidateInput) {
				matches++;
			}
		}

		return matches / target.length;
	}
}
