/**
 * Flow Recommendation Engine
 *
 * Recommends existing flows based on idea descriptions.
 * Provides methods for:
 * - Parsing idea descriptions into structured requirements
 * - Finding matching flows using FlowAnalyzer
 * - Ranking recommendations by fit score
 * - Generating adaptation suggestions
 *
 * Used by the idea-to-tickets system to determine if existing flows can be reused.
 */
import type { FlowDefinition, VariableType } from '../types';
import { FlowAnalyzer, type FlowCapabilities, type FlowPattern } from './FlowAnalyzer';

/**
 * Parsed requirements from an idea description
 */
export interface IdeaRequirements {
	/** Original idea description */
	description: string;

	/** Extracted objective */
	objective: string;

	/** Required inputs */
	inputs: InputRequirement[];

	/** Expected outputs */
	outputs: OutputRequirement[];

	/** Suggested patterns */
	suggestedPatterns: FlowPattern[];

	/** Complexity level */
	complexity: 'simple' | 'medium' | 'complex';

	/** Keywords extracted from idea */
	keywords: string[];
}

/**
 * Input requirement extracted from idea
 */
export interface InputRequirement {
	/** Input name */
	name: string;

	/** Variable type */
	type: VariableType;

	/** Whether required */
	required: boolean;

	/** Description */
	description: string;
}

/**
 * Output requirement extracted from idea
 */
export interface OutputRequirement {
	/** Output name */
	name: string;

	/** Variable type */
	type: VariableType;

	/** Description */
	description: string;
}

/**
 * Adaptation suggestion for a recommended flow
 */
export interface AdaptationSuggestion {
	/** Type of adaptation */
	type: 'add-input' | 'modify-step' | 'add-step' | 'change-workspace' | 'remove-step' | 'change-model';

	/** Description of the change */
	description: string;

	/** Priority level */
	priority: 'required' | 'recommended' | 'optional';

	/** Target location (step ID, input name, etc.) */
	target?: string;
}

/**
 * Flow recommendation result
 */
export interface FlowRecommendation {
	/** Recommended flow */
	flow: FlowDefinition;

	/** Fit score (0-100) */
	fitScore: number;

	/** Capabilities that match the idea */
	matchedCapabilities: string[];

	/** Gaps between flow and requirements */
	gaps: string[];

	/** Suggestions for adapting the flow */
	adaptationSuggestions: AdaptationSuggestion[];

	/** Reasoning for why this flow was recommended */
	reasoning: string;
}

/**
 * Flow Recommendation Engine
 */
export class FlowRecommendationEngine {
	private analyzer: FlowAnalyzer;

	/**
	 * Create a new FlowRecommendationEngine
	 */
	constructor() {
		this.analyzer = new FlowAnalyzer();
	}

	/**
	 * Recommend flows based on an idea description
	 * @param ideaDescription - Natural language description of the idea
	 * @param allFlows - All available flows to consider
	 * @param maxRecommendations - Maximum number of recommendations to return
	 * @returns Array of flow recommendations sorted by fit score (highest first)
	 */
	public recommendFlows(
		ideaDescription: string,
		allFlows: FlowDefinition[],
		maxRecommendations: number = 5
	): FlowRecommendation[] {
		// Parse idea into structured requirements
		const requirements = this.parseIdeaDescription(ideaDescription);

		// Create target capabilities from requirements
		const targetCapabilities = this.requirementsToCapabilities(requirements);

		// Find similar flows
		const similarFlows = this.analyzer.findSimilarFlows(targetCapabilities, allFlows);

		// Generate recommendations with adaptation suggestions
		const recommendations = similarFlows
			.slice(0, maxRecommendations)
			.map(({ flow, similarityScore, matchedPatterns, matchedTags }) => {
				const capabilities = this.analyzer.analyzeFlow(flow);
				return this.buildRecommendation(
					flow,
					capabilities,
					requirements,
					similarityScore,
					matchedPatterns,
					matchedTags
				);
			});

		return recommendations;
	}

	/**
	 * Parse an idea description into structured requirements
	 * @param description - Natural language description
	 * @returns Parsed requirements
	 */
	public parseIdeaDescription(description: string): IdeaRequirements {
		const lowerDesc = description.toLowerCase();

		// Extract objective (first sentence or full description)
		const objective = description.split('.')[0].trim() || description;

		// Extract keywords
		const keywords = this.extractKeywords(description);

		// Infer patterns from keywords
		const suggestedPatterns = this.inferPatterns(lowerDesc, keywords);

		// Infer complexity
		const complexity = this.inferComplexity(description, suggestedPatterns);

		// Extract inputs (look for common input patterns)
		const inputs = this.extractInputs(description, lowerDesc);

		// Extract outputs (look for expected outcomes)
		const outputs = this.extractOutputs(description, lowerDesc);

		return {
			description,
			objective,
			inputs,
			outputs,
			suggestedPatterns,
			complexity,
			keywords,
		};
	}

	/**
	 * Extract keywords from idea description
	 */
	private extractKeywords(description: string): string[] {
		const text = description.toLowerCase();
		const keywords: string[] = [];

		// Task keywords
		const taskKeywords = [
			'implement',
			'fix',
			'refactor',
			'test',
			'build',
			'deploy',
			'analyze',
			'review',
			'approve',
			'validate',
			'transform',
			'extract',
			'load',
			'create',
			'update',
			'delete',
			'migrate',
		];

		// Domain keywords
		const domainKeywords = [
			'pipeline',
			'automation',
			'ci/cd',
			'data',
			'code',
			'documentation',
			'security',
			'performance',
			'api',
			'database',
			'frontend',
			'backend',
		];

		// Combine all keywords
		const allKeywords = [...taskKeywords, ...domainKeywords];

		for (const keyword of allKeywords) {
			if (text.includes(keyword)) {
				keywords.push(keyword);
			}
		}

		return keywords;
	}

	/**
	 * Infer flow patterns from description
	 */
	private inferPatterns(lowerDesc: string, keywords: string[]): FlowPattern[] {
		const patterns: FlowPattern[] = [];

		// ETL pattern
		if (
			lowerDesc.includes('extract') ||
			lowerDesc.includes('transform') ||
			lowerDesc.includes('load') ||
			lowerDesc.includes('etl')
		) {
			patterns.push('etl-pipeline');
		}

		// Build pipeline
		if (keywords.includes('build') || keywords.includes('deploy') || lowerDesc.includes('ci/cd')) {
			patterns.push('build-pipeline');
		}

		// Conditional
		if (lowerDesc.includes('if') || lowerDesc.includes('when') || lowerDesc.includes('conditional')) {
			patterns.push('conditional');
		}

		// Retry/loop
		if (lowerDesc.includes('retry') || lowerDesc.includes('loop') || lowerDesc.includes('until')) {
			patterns.push('retry-loop');
		}

		// User intervention
		if (lowerDesc.includes('approval') || lowerDesc.includes('review') || lowerDesc.includes('approve')) {
			patterns.push('user-intervention');
		}

		// Parallel processing
		if (lowerDesc.includes('parallel') || lowerDesc.includes('concurrent')) {
			patterns.push('fan-out');
		}

		// Default to linear pipeline if no specific pattern found
		if (patterns.length === 0) {
			patterns.push('linear-pipeline');
		}

		return patterns;
	}

	/**
	 * Infer complexity level from description
	 */
	private inferComplexity(description: string, patterns: FlowPattern[]): 'simple' | 'medium' | 'complex' {
		const words = description.split(/\s+/).length;

		// Word count heuristic
		if (words < 20) return 'simple';
		if (words > 50) return 'complex';

		// Pattern complexity
		if (patterns.length > 2) return 'complex';
		if (patterns.length > 1) return 'medium';

		return 'simple';
	}

	/**
	 * Extract input requirements from description
	 */
	private extractInputs(description: string, lowerDesc: string): InputRequirement[] {
		const inputs: InputRequirement[] = [];

		// Common input patterns
		const inputPatterns = [
			{ keyword: 'file', type: 'file' as VariableType, name: 'inputFile' },
			{ keyword: 'folder', type: 'folder' as VariableType, name: 'inputFolder' },
			{ keyword: 'url', type: 'url' as VariableType, name: 'targetUrl' },
			{ keyword: 'code', type: 'text' as VariableType, name: 'sourceCode' },
			{ keyword: 'description', type: 'text' as VariableType, name: 'description' },
			{ keyword: 'count', type: 'integer' as VariableType, name: 'count' },
			{ keyword: 'name', type: 'string' as VariableType, name: 'name' },
		];

		for (const pattern of inputPatterns) {
			if (lowerDesc.includes(pattern.keyword)) {
				inputs.push({
					name: pattern.name,
					type: pattern.type,
					required: true,
					description: `${pattern.keyword.charAt(0).toUpperCase() + pattern.keyword.slice(1)} input`,
				});
			}
		}

		// Default input if none found
		if (inputs.length === 0) {
			inputs.push({
				name: 'input',
				type: 'string',
				required: true,
				description: 'Main input',
			});
		}

		return inputs;
	}

	/**
	 * Extract output requirements from description
	 */
	private extractOutputs(description: string, lowerDesc: string): OutputRequirement[] {
		const outputs: OutputRequirement[] = [];

		// Common output patterns
		if (lowerDesc.includes('result') || lowerDesc.includes('output')) {
			outputs.push({
				name: 'result',
				type: 'string',
				description: 'Main result',
			});
		}

		if (lowerDesc.includes('report')) {
			outputs.push({
				name: 'report',
				type: 'text',
				description: 'Generated report',
			});
		}

		if (lowerDesc.includes('status')) {
			outputs.push({
				name: 'status',
				type: 'string',
				description: 'Status outcome',
			});
		}

		// Default output if none found
		if (outputs.length === 0) {
			outputs.push({
				name: 'output',
				type: 'string',
				description: 'Main output',
			});
		}

		return outputs;
	}

	/**
	 * Convert requirements to capabilities for matching
	 */
	private requirementsToCapabilities(requirements: IdeaRequirements): FlowCapabilities {
		return {
			id: 'target',
			purpose: requirements.objective,
			patterns: requirements.suggestedPatterns,
			inputs: requirements.inputs.map(i => ({
				name: i.name,
				type: i.type,
				required: i.required,
				description: i.description,
			})),
			outputs: [], // Not used for matching
			complexity: requirements.complexity === 'simple' ? 3 : requirements.complexity === 'medium' ? 6 : 9,
			tags: requirements.keywords,
			stepCount: 0,
			isolated: true,
			usesSubflows: false,
			requiresApproval: requirements.suggestedPatterns.includes('user-intervention'),
		};
	}

	/**
	 * Build a recommendation with adaptation suggestions
	 */
	private buildRecommendation(
		flow: FlowDefinition,
		capabilities: FlowCapabilities,
		requirements: IdeaRequirements,
		similarityScore: number,
		matchedPatterns: FlowPattern[],
		matchedTags: string[]
	): FlowRecommendation {
		const matchedCapabilities = this.buildMatchedCapabilities(matchedPatterns, matchedTags);
		const gaps = this.identifyGaps(requirements, capabilities);
		const adaptationSuggestions = this.generateAdaptationSuggestions(requirements, capabilities, gaps);
		const reasoning = this.buildReasoning(flow, matchedPatterns, matchedTags, similarityScore);

		return {
			flow,
			fitScore: similarityScore,
			matchedCapabilities,
			gaps,
			adaptationSuggestions,
			reasoning,
		};
	}

	/**
	 * Build matched capabilities description
	 */
	private buildMatchedCapabilities(matchedPatterns: FlowPattern[], matchedTags: string[]): string[] {
		const capabilities: string[] = [];

		if (matchedPatterns.length > 0) {
			capabilities.push(`Patterns: ${matchedPatterns.join(', ')}`);
		}

		if (matchedTags.length > 0) {
			capabilities.push(`Tags: ${matchedTags.join(', ')}`);
		}

		return capabilities;
	}

	/**
	 * Identify gaps between requirements and flow capabilities
	 */
	private identifyGaps(requirements: IdeaRequirements, capabilities: FlowCapabilities): string[] {
		const gaps: string[] = [];

		// Check for missing patterns
		const missingPatterns = requirements.suggestedPatterns.filter(p => !capabilities.patterns.includes(p));
		if (missingPatterns.length > 0) {
			gaps.push(`Missing patterns: ${missingPatterns.join(', ')}`);
		}

		// Check for missing inputs
		const missingInputs = requirements.inputs.filter(
			reqInput =>
				!capabilities.inputs.some(
					capInput => capInput.name === reqInput.name || capInput.type === reqInput.type
				)
		);
		if (missingInputs.length > 0) {
			gaps.push(`Missing inputs: ${missingInputs.map(i => i.name).join(', ')}`);
		}

		// Check for complexity mismatch
		const reqComplexity = requirements.complexity === 'simple' ? 3 : requirements.complexity === 'medium' ? 6 : 9;
		if (Math.abs(reqComplexity - capabilities.complexity) > 3) {
			gaps.push(
				`Complexity mismatch: flow is ${capabilities.complexity > reqComplexity ? 'more' : 'less'} complex than needed`
			);
		}

		return gaps;
	}

	/**
	 * Generate adaptation suggestions based on gaps
	 */
	private generateAdaptationSuggestions(
		requirements: IdeaRequirements,
		capabilities: FlowCapabilities,
		gaps: string[]
	): AdaptationSuggestion[] {
		const suggestions: AdaptationSuggestion[] = [];

		// Suggest adding missing inputs
		const missingInputs = requirements.inputs.filter(
			reqInput => !capabilities.inputs.some(capInput => capInput.name === reqInput.name)
		);
		for (const input of missingInputs) {
			suggestions.push({
				type: 'add-input',
				description: `Add input '${input.name}' of type ${input.type}`,
				priority: input.required ? 'required' : 'recommended',
				target: input.name,
			});
		}

		// Suggest adding missing steps for patterns
		const missingPatterns = requirements.suggestedPatterns.filter(p => !capabilities.patterns.includes(p));
		for (const pattern of missingPatterns) {
			if (pattern === 'user-intervention') {
				suggestions.push({
					type: 'add-step',
					description: 'Add user intervention step for approval/review',
					priority: 'recommended',
				});
			} else if (pattern === 'retry-loop') {
				suggestions.push({
					type: 'modify-step',
					description: 'Add retry logic with onFailure.goto configuration',
					priority: 'recommended',
				});
			}
		}

		// Suggest workspace changes if needed
		if (requirements.keywords.includes('code') && !capabilities.isolated) {
			suggestions.push({
				type: 'change-workspace',
				description: 'Change workspace mode to isolated for code modifications',
				priority: 'recommended',
			});
		}

		// If no gaps, suggest optional optimizations
		if (gaps.length === 0) {
			suggestions.push({
				type: 'change-model',
				description: 'Consider using a faster model (haiku) if performance is critical',
				priority: 'optional',
			});
		}

		return suggestions;
	}

	/**
	 * Build reasoning text for recommendation
	 */
	private buildReasoning(
		flow: FlowDefinition,
		matchedPatterns: FlowPattern[],
		matchedTags: string[],
		similarityScore: number
	): string {
		const reasons: string[] = [];

		reasons.push(`This flow has a ${similarityScore}% fit score.`);

		if (matchedPatterns.length > 0) {
			reasons.push(`It matches your required patterns: ${matchedPatterns.join(', ')}.`);
		}

		if (matchedTags.length > 0) {
			reasons.push(`It addresses similar concerns: ${matchedTags.join(', ')}.`);
		}

		reasons.push(
			`The flow "${flow.name}" has ${flow.steps.length} steps and ${flow.workspace.mode} workspace mode.`
		);

		return reasons.join(' ');
	}
}
