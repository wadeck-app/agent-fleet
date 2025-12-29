/**
 * Proxy types for flow-engine
 * These are temporary types until we properly configure the imports
 */

export type ModelType = 'sonnet' | 'haiku' | 'opus';
export type WorkspaceMode = 'isolated' | 'shared' | 'manual';
export type GitStrategy = 'main-only' | 'feature-branch' | 'any' | 'worktree';
export type ReusePolicy = 'never' | 'if-available' | 'always';

export interface WorkspaceConfig {
	mode: WorkspaceMode;
	gitStrategy: GitStrategy;
	reusePolicy: ReusePolicy;
	concurrencyKey?: string;
}

export interface BaseFlowStep {
	id: string;
	name: string;
	depends?: string[];
	when?: string;
	skipOnLoop?: boolean;
	onFailure?: {
		goto?: string;
		maxIterations?: number;
		resetOnSuccess?: boolean;
	};
}

export interface ModelFlowStep extends BaseFlowStep {
	type: 'model';
	model: ModelType;
	prompt: string;
}

export interface ScriptFlowStep extends BaseFlowStep {
	type: 'script';
	script: string;
	workingDir?: string;
	env?: Record<string, string>;
}

export interface SubFlowStep extends BaseFlowStep {
	type: 'subflow';
	flowId: string;
	inputs: Record<string, string>;
	workspaceStrategy?: 'inherit' | 'separate';
}

export type FlowStep = ModelFlowStep | ScriptFlowStep | SubFlowStep;

export interface FlowDefinition {
	id: string;
	version: string;
	name: string;
	description: string;
	workspace: WorkspaceConfig;
	inputs: Record<string, string>;
	steps: FlowStep[];
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
	code: string;
	message: string;
	severity: ValidationSeverity;
	location?: {
		stepId?: string;
		field?: string;
	};
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
	summary: {
		errors: number;
		warnings: number;
		info: number;
	};
}

// Mock FlowValidator for now
export class FlowValidator {
	validate(flow: FlowDefinition): ValidationResult {
		// Simple validation - just check for empty steps
		const issues: ValidationIssue[] = [];

		if (!flow.steps || flow.steps.length === 0) {
			issues.push({
				code: 'EMPTY_FLOW',
				message: 'Flow has no steps',
				severity: 'error',
			});
		}

		// Check for duplicate step IDs
		const stepIds = new Set<string>();
		flow.steps.forEach(step => {
			if (stepIds.has(step.id)) {
				issues.push({
					code: 'DUPLICATE_ID',
					message: `Duplicate step ID: ${step.id}`,
					severity: 'error',
					location: { stepId: step.id },
				});
			}
			stepIds.add(step.id);
		});

		// Check for invalid dependencies
		flow.steps.forEach(step => {
			if (step.depends) {
				step.depends.forEach(depId => {
					if (!stepIds.has(depId)) {
						issues.push({
							code: 'INVALID_DEPENDENCY',
							message: `Step ${step.id} depends on non-existent step: ${depId}`,
							severity: 'error',
							location: { stepId: step.id },
						});
					}
				});
			}
		});

		return {
			valid: issues.filter(i => i.severity === 'error').length === 0,
			issues,
			summary: {
				errors: issues.filter(i => i.severity === 'error').length,
				warnings: issues.filter(i => i.severity === 'warning').length,
				info: issues.filter(i => i.severity === 'info').length,
			},
		};
	}
}
