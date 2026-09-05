/**
 * Flow Generator
 *
 * Generates custom flows from structured requirements.
 * Provides methods for:
 * - Selecting appropriate base patterns
 * - Generating flow structures (metadata, workspace, inputs)
 * - Generating steps based on patterns
 * - Validating generated flows
 *
 * Used by the idea-to-tickets system when existing flows cannot be reused.
 */
import type { FlowPattern } from '../analysis/FlowAnalyzer';
import type { IdeaRequirements, InputRequirement } from '../analysis/FlowRecommendationEngine';
import type {
	FlowDefinition,
	FlowStep,
	GitStrategy,
	InputSpec,
	ModelFlowStep,
	ReusePolicy,
	ScriptFlowStep,
	WorkspaceConfig,
	WorkspaceMode,
} from '../types';
import type { FlowValidator } from '../validation/FlowValidator';
import type { ValidationResult } from '../validation/ValidationTypes';

/**
 * Flow constraints for generation
 */
export interface FlowConstraints {
	/** Workspace mode preference */
	workspaceMode?: WorkspaceMode;

	/** Git strategy preference */
	gitStrategy?: GitStrategy;

	/** Reuse policy preference */
	reusePolicy?: ReusePolicy;

	/** Maximum number of steps */
	maxSteps?: number;

	/** Whether flow requires approval */
	requiresApproval?: boolean;

	/** Timeout in minutes */
	timeout?: number;

	/** Preferred model for AI steps */
	preferredModel?: 'haiku' | 'sonnet' | 'opus';
}

/**
 * Flow generation result
 */
export interface FlowGenerationResult {
	/** Generated flow definition */
	flow: FlowDefinition;

	/** Validation result */
	validationResult: ValidationResult;

	/** Generation metadata */
	metadata: {
		/** Pattern used as base */
		basePattern: FlowPattern;

		/** Number of steps generated */
		stepCount: number;

		/** Generation timestamp */
		generatedAt: string;

		/** Warnings or notes about generation */
		notes: string[];
	};
}

/**
 * Flow Generator
 */
export class FlowGenerator {
	private validator?: FlowValidator;

	/**
	 * Create a new FlowGenerator
	 * @param validator - Optional FlowValidator for validating generated flows
	 */
	constructor(validator?: FlowValidator) {
		this.validator = validator;
	}

	/**
	 * Generate a custom flow from requirements
	 * @param requirements - Structured requirements from idea description
	 * @param constraints - Optional constraints for generation
	 * @returns Generation result with flow and validation report
	 */
	public generateFlow(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowGenerationResult {
		const notes: string[] = [];

		// Select base pattern
		const basePattern = this.selectBasePattern(requirements, constraints);
		notes.push(`Selected base pattern: ${basePattern}`);

		// Generate flow ID
		const flowId = this.generateFlowId(requirements.objective);

		// Generate workspace config
		const workspace = this.generateWorkspaceConfig(requirements, constraints, basePattern);

		// Generate inputs
		const inputs = this.generateInputs(requirements.inputs);

		// Generate steps based on pattern
		const steps = this.generateSteps(requirements, basePattern, constraints);
		notes.push(`Generated ${steps.length} steps`);

		// Build flow definition
		const flow: FlowDefinition = {
			id: flowId,
			version: '1.0.0',
			name: this.generateFlowName(requirements.objective),
			description: requirements.description,
			workspace,
			inputs,
			steps,
		};

		// Validate generated flow
		const validationResult = this.validator
			? this.validator.validate(flow)
			: { valid: true, issues: [], summary: { errors: 0, warnings: 0, info: 0 } };

		if (!validationResult.valid) {
			notes.push(` Generated flow has ${validationResult.summary.errors} validation errors`);
		}

		return {
			flow,
			validationResult,
			metadata: {
				basePattern,
				stepCount: steps.length,
				generatedAt: new Date().toISOString(),
				notes,
			},
		};
	}

	/**
	 * Select the most appropriate base pattern
	 */
	private selectBasePattern(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowPattern {
		// If user intervention required, prioritize that pattern
		if (constraints?.requiresApproval || requirements.suggestedPatterns.includes('user-intervention')) {
			return 'user-intervention';
		}

		// If retry/loop suggested, use that
		if (requirements.suggestedPatterns.includes('retry-loop')) {
			return 'retry-loop';
		}

		// If ETL or build pipeline suggested, use those
		if (requirements.suggestedPatterns.includes('etl-pipeline')) {
			return 'etl-pipeline';
		}
		if (requirements.suggestedPatterns.includes('build-pipeline')) {
			return 'build-pipeline';
		}

		// If conditional logic needed
		if (requirements.suggestedPatterns.includes('conditional')) {
			return 'conditional';
		}

		// If parallel processing needed
		if (requirements.suggestedPatterns.includes('fan-out') || requirements.suggestedPatterns.includes('diamond')) {
			return 'diamond';
		}

		// Default to linear pipeline for simple cases
		return 'linear-pipeline';
	}

	/**
	 * Generate flow ID from objective
	 */
	private generateFlowId(objective: string): string {
		// Convert to kebab-case
		const kebab = objective
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.substring(0, 50);

		return `generated-${kebab}`;
	}

	/**
	 * Generate flow name from objective
	 */
	private generateFlowName(objective: string): string {
		// Capitalize first letter of each word
		return objective
			.split(' ')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ')
			.substring(0, 100);
	}

	/**
	 * Generate workspace configuration
	 */
	private generateWorkspaceConfig(
		requirements: IdeaRequirements,
		constraints?: FlowConstraints,
		_pattern?: FlowPattern
	): WorkspaceConfig {
		// Default to isolated for code-related tasks, shared for others
		const defaultMode: WorkspaceMode =
			requirements.keywords.includes('code') || requirements.keywords.includes('implement')
				? 'isolated'
				: 'shared';

		return {
			mode: constraints?.workspaceMode || defaultMode,
			gitStrategy: constraints?.gitStrategy || 'main-only',
			reusePolicy: constraints?.reusePolicy || 'always',
		};
	}

	/**
	 * Generate inputs from requirements
	 */
	private generateInputs(inputRequirements: InputRequirement[]): Record<string, InputSpec> {
		const inputs: Record<string, InputSpec> = {};

		for (const req of inputRequirements) {
			inputs[req.name] = {
				type: req.type,
				required: req.required,
				description: req.description,
			};
		}

		return inputs;
	}

	/**
	 * Generate steps based on pattern and requirements
	 */
	private generateSteps(
		requirements: IdeaRequirements,
		pattern: FlowPattern,
		constraints?: FlowConstraints
	): FlowStep[] {
		switch (pattern) {
			case 'linear-pipeline':
				return this.generateLinearPipelineSteps(requirements, constraints);
			case 'build-pipeline':
				return this.generateBuildPipelineSteps(requirements, constraints);
			case 'etl-pipeline':
				return this.generateETLPipelineSteps(requirements, constraints);
			case 'diamond':
				return this.generateDiamondSteps(requirements, constraints);
			case 'retry-loop':
				return this.generateRetryLoopSteps(requirements, constraints);
			case 'conditional':
				return this.generateConditionalSteps(requirements, constraints);
			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	/**
	 * Generate linear pipeline steps (A → B → C)
	 */
	private generateLinearPipelineSteps(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];
		const model = constraints?.preferredModel || 'sonnet';

		// Step 1: Analyze input
		steps.push({
			type: 'model',
			id: 'analyze',
			name: 'Analyze Input',
			model,
			prompt: this.generateAnalysisPrompt(requirements),
			output: {
				analysis: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 2: Process
		steps.push({
			type: 'model',
			id: 'process',
			name: 'Process Request',
			model,
			depends: ['analyze'],
			prompt: this.generateProcessingPrompt(requirements),
			output: {
				result: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 3: Finalize
		steps.push({
			type: 'model',
			id: 'finalize',
			name: 'Finalize Output',
			model,
			depends: ['process'],
			prompt: this.generateFinalizationPrompt(requirements),
			output: {
				finalResult: { type: 'text' },
			},
		} as ModelFlowStep);

		return steps;
	}

	/**
	 * Generate build pipeline steps (checkout → build → test → deploy)
	 */
	private generateBuildPipelineSteps(_requirements: IdeaRequirements, _constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];

		// Step 1: Checkout
		steps.push({
			type: 'script',
			id: 'checkout',
			name: 'Checkout Code',
			script: 'echo "Checking out code..."',
			output: {
				branch: { type: 'string', pattern: 'branch=(.*)' },
			},
		} as ScriptFlowStep);

		// Step 2: Build
		steps.push({
			type: 'script',
			id: 'build',
			name: 'Build Project',
			depends: ['checkout'],
			script: 'echo "Building project..."',
			output: {
				buildStatus: { type: 'string' },
			},
		} as ScriptFlowStep);

		// Step 3: Test
		steps.push({
			type: 'script',
			id: 'test',
			name: 'Run Tests',
			depends: ['build'],
			script: 'echo "Running tests..."',
			output: {
				testStatus: { type: 'string' },
				testsPassed: { type: 'integer', pattern: 'passed=(\\d+)' },
			},
		} as ScriptFlowStep);

		// Step 4: Deploy
		steps.push({
			type: 'script',
			id: 'deploy',
			name: 'Deploy Application',
			depends: ['test'],
			script: 'echo "Deploying application..."',
			output: {
				deployStatus: { type: 'string' },
			},
		} as ScriptFlowStep);

		return steps;
	}

	/**
	 * Generate ETL pipeline steps (Extract → Transform → Load)
	 */
	private generateETLPipelineSteps(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];

		// Step 1: Extract
		steps.push({
			type: 'script',
			id: 'extract',
			name: 'Extract Data',
			script: 'echo "Extracting data from source..."',
			output: {
				rawData: { type: 'text' },
			},
		} as ScriptFlowStep);

		// Step 2: Transform
		steps.push({
			type: 'model',
			id: 'transform',
			name: 'Transform Data',
			model: constraints?.preferredModel || 'sonnet',
			depends: ['extract'],
			prompt: `Transform the extracted data according to requirements:\n\nData: \${{ steps.extract.outputs.rawData }}\nRequirements: ${requirements.description}`,
			output: {
				transformedData: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 3: Load
		steps.push({
			type: 'script',
			id: 'load',
			name: 'Load Data',
			depends: ['transform'],
			script: 'echo "Loading transformed data..."',
			output: {
				loadStatus: { type: 'string' },
			},
		} as ScriptFlowStep);

		return steps;
	}

	/**
	 * Generate diamond pattern steps (A → {B,C} → D)
	 */
	private generateDiamondSteps(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];
		const model = constraints?.preferredModel || 'sonnet';

		// Step 1: Initialize
		steps.push({
			type: 'model',
			id: 'initialize',
			name: 'Initialize Processing',
			model,
			prompt: this.generateAnalysisPrompt(requirements),
			output: {
				context: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 2a: Parallel branch A
		steps.push({
			type: 'model',
			id: 'process-a',
			name: 'Process Path A',
			model,
			depends: ['initialize'],
			prompt: 'Process path A based on context: ${{ steps.initialize.outputs.context }}',
			output: {
				resultA: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 2b: Parallel branch B
		steps.push({
			type: 'model',
			id: 'process-b',
			name: 'Process Path B',
			model,
			depends: ['initialize'],
			prompt: 'Process path B based on context: ${{ steps.initialize.outputs.context }}',
			output: {
				resultB: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 3: Merge
		steps.push({
			type: 'model',
			id: 'merge',
			name: 'Merge Results',
			model,
			depends: ['process-a', 'process-b'],
			prompt: 'Merge results from both paths:\n\nPath A: ${{ steps.process-a.outputs.resultA }}\nPath B: ${{ steps.process-b.outputs.resultB }}',
			output: {
				finalResult: { type: 'text' },
			},
		} as ModelFlowStep);

		return steps;
	}

	/**
	 * Generate retry loop steps (A → B → fail → A)
	 */
	private generateRetryLoopSteps(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];
		const model = constraints?.preferredModel || 'sonnet';

		// Step 1: Implement
		steps.push({
			type: 'model',
			id: 'implement',
			name: 'Implement Solution',
			model,
			prompt: this.generateImplementationPrompt(requirements),
			output: {
				implementation: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 2: Test (with loop back on failure)
		steps.push({
			type: 'script',
			id: 'test',
			name: 'Test Implementation',
			depends: ['implement'],
			script: 'echo "Running tests..."',
			output: {
				testResult: { type: 'string' },
				success: { type: 'boolean', pattern: 'success=(.*)' },
			},
			onFailure: {
				goto: 'implement',
				maxIterations: 3,
				addComment: 'Tests failed, retrying implementation...',
			},
		} as ScriptFlowStep);

		return steps;
	}

	/**
	 * Generate conditional steps (A → B if X, C if Y)
	 */
	private generateConditionalSteps(requirements: IdeaRequirements, constraints?: FlowConstraints): FlowStep[] {
		const steps: FlowStep[] = [];
		const model = constraints?.preferredModel || 'sonnet';

		// Step 1: Evaluate condition
		steps.push({
			type: 'model',
			id: 'evaluate',
			name: 'Evaluate Condition',
			model,
			prompt: this.generateAnalysisPrompt(requirements),
			output: {
				condition: { type: 'string' },
				shouldProceed: { type: 'boolean', pattern: 'proceed=(.*)' },
			},
		} as ModelFlowStep);

		// Step 2a: Branch A (when condition is true)
		steps.push({
			type: 'model',
			id: 'branch-a',
			name: 'Execute Branch A',
			model,
			depends: ['evaluate'],
			when: '${{ steps.evaluate.outputs.shouldProceed === true }}',
			prompt: 'Execute branch A logic based on condition.',
			output: {
				result: { type: 'text' },
			},
		} as ModelFlowStep);

		// Step 2b: Branch B (when condition is false)
		steps.push({
			type: 'model',
			id: 'branch-b',
			name: 'Execute Branch B',
			model,
			depends: ['evaluate'],
			when: '${{ steps.evaluate.outputs.shouldProceed === false }}',
			prompt: 'Execute branch B logic based on condition.',
			output: {
				result: { type: 'text' },
			},
		} as ModelFlowStep);

		return steps;
	}

	/**
	 * Generate analysis prompt for a step
	 */
	private generateAnalysisPrompt(requirements: IdeaRequirements): string {
		const inputRefs = requirements.inputs.map(i => `\${{ inputs.${i.name} }}`).join('\n');
		return `Analyze the following inputs to ${requirements.objective}:\n\n${inputRefs}\n\nProvide a detailed analysis.`;
	}

	/**
	 * Generate processing prompt for a step
	 */
	private generateProcessingPrompt(requirements: IdeaRequirements): string {
		return `Process the analysis to ${requirements.objective}:\n\nAnalysis: \${{ steps.analyze.outputs.analysis }}\n\nProvide the processed result.`;
	}

	/**
	 * Generate finalization prompt for a step
	 */
	private generateFinalizationPrompt(requirements: IdeaRequirements): string {
		return `Finalize the output for ${requirements.objective}:\n\nResult: \${{ steps.process.outputs.result }}\n\nProvide the final result.`;
	}

	/**
	 * Generate implementation prompt for a step
	 */
	private generateImplementationPrompt(requirements: IdeaRequirements): string {
		const inputRefs = requirements.inputs.map(i => `\${{ inputs.${i.name} }}`).join('\n');
		return `Implement a solution to ${requirements.objective}:\n\n${inputRefs}\n\nProvide the implementation.`;
	}
}
