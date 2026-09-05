/**
 * Flow Orchestrator
 *
 * Orchestrates the execution of flow steps based on DAG dependencies.
 * Handles parallel execution, loop logic, and output management.
 * Scheduling logic (dependency resolution, when:, retry, loop) is delegated to FlowScheduler.
 */
import type { ApprovalProvider } from 'extension-points';
import { v4 as uuidv4 } from 'uuid';

import { FlowScheduler } from '../orchestration/FlowScheduler';
import type { ReadyItem, SchedulerStep, StepOutcome } from '../orchestration/FlowScheduler';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowDefinition, FlowExecutionResult, FlowStep, FlowTrace, Workspace } from '../types';
import { DAGBuilder } from '../validation/DAGBuilder';
import { DAGValidator } from '../validation/DAGValidator';
import type { StepRunner } from './StepRunner';

/**
 * Orchestration error
 */
export class OrchestrationError extends Error {
	constructor(
		message: string,
		public flowId: string
	) {
		super(`Flow orchestration error in '${flowId}': ${message}`);
		this.name = 'OrchestrationError';
	}
}

/**
 * Flow Orchestrator class
 */
export class FlowOrchestrator {
	private dagBuilder: DAGBuilder;
	private dagValidator: DAGValidator;
	private stepRunner: StepRunner;
	private templateRenderer: TemplateRenderer;

	constructor(stepRunner: StepRunner, approvalProvider?: ApprovalProvider) {
		this.dagBuilder = new DAGBuilder();
		this.dagValidator = new DAGValidator();
		this.stepRunner = stepRunner;
		this.templateRenderer = new TemplateRenderer();
		if (approvalProvider) {
			this.stepRunner.setApprovalProvider(approvalProvider);
		}
	}

	/**
	 * Orchestrate flow execution
	 */
	public async orchestrate(
		taskId: string,
		flow: FlowDefinition,
		workspace: Workspace,
		context: TemplateContext,
		onTraceUpdate?: (trace: FlowTrace) => void
	): Promise<FlowExecutionResult> {
		// Initialize trace
		const trace: FlowTrace = {
			id: uuidv4(),
			taskId,
			flowId: flow.id,
			workspaceId: workspace.id,
			startTime: Date.now(),
			status: 'running',
			steps: [],
		};

		// Step outputs map
		const stepOutputs = context.stepOutputs;

		try {
			// Build and validate DAG (upfront validation only -- scheduling is FlowScheduler's job)
			const dag = this.dagBuilder.buildDAG(flow.steps);
			const validation = this.dagValidator.validate(dag);

			if (!validation.valid) {
				const errorMessages = validation.errors.map(e => String(e)).join('; ');
				throw new OrchestrationError(`DAG validation failed: ${errorMessages}`, flow.id);
			}

			// Log warnings if any
			if (validation.warnings.length > 0) {
				console.warn(`  DAG validation warnings for flow '${flow.id}':`);
				for (const warning of validation.warnings) {
					console.warn(`   - ${warning.message}`);
				}
			}

			// Execute flow
			const result = await this.executeFlow(flow, workspace, context, trace, stepOutputs, onTraceUpdate);

			return result;
		} catch (error) {
			trace.status = 'failed';
			trace.endTime = Date.now();

			const errorMessage = error instanceof Error ? String(error) : String(error);

			return {
				success: false,
				trace,
				error: errorMessage,
				outputs: this.mapToObject(stepOutputs),
			};
		}
	}

	/**
	 * Execute flow with DAG-based parallelization via FlowScheduler
	 */
	private async executeFlow(
		flow: FlowDefinition,
		workspace: Workspace,
		context: TemplateContext,
		trace: FlowTrace,
		stepOutputs: Map<string, Record<string, any>>,
		onTraceUpdate?: (trace: FlowTrace) => void
	): Promise<FlowExecutionResult> {
		const depends = new Map<string, string[]>(flow.steps.map((s: FlowStep) => [s.id, s.depends ?? []]));

		// Resolve global env templates once; step-level env merges on top
		const resolvedGlobalEnv: Record<string, string> | undefined = flow.env
			? Object.fromEntries(
					Object.entries(flow.env).map(([k, v]) => [k, this.templateRenderer.render(v, context, true)])
				)
			: undefined;

		const scheduler = new FlowScheduler({
			inputs: context.inputs ?? {},
			stepOutputs,
		});

		let readyItems = scheduler.start(flow.steps as unknown as SchedulerStep[], depends);

		while (!scheduler.isTerminal()) {
			if (readyItems.length === 0) {
				// No ready steps, no in-flight steps → deadlock (shouldn't happen after DAG validation)
				const remaining = flow.steps.filter((s: FlowStep) => !stepOutputs.has(s.id));
				throw new OrchestrationError(
					`No steps ready to execute, but ${remaining.length} steps remain: ${remaining
						.map((s: FlowStep) => s.id)
						.join(', ')}`,
					flow.id
				);
			}

			// Acknowledge all ready items before dispatching
			for (const item of readyItems) {
				scheduler.acknowledge(item.stepId);
			}

			// Execute ready steps in parallel
			const startTime = Date.now();
			this.logStepExecution(
				readyItems.map(item => item.step as unknown as FlowStep),
				startTime
			);

			const stepTraces = await Promise.all(
				readyItems.map(item => {
					const rawStep = item.step as unknown as FlowStep;
					const step: FlowStep =
						resolvedGlobalEnv && rawStep.type === 'script'
							? { ...rawStep, env: { ...resolvedGlobalEnv, ...(rawStep.env ?? {}) } }
							: rawStep;
					return this.stepRunner.executeStep(step, workspace, context, inProgressTrace => {
						// Add or replace the in-progress trace for real-time visibility
						const existingIndex = trace.steps.findIndex(t => t.stepId === inProgressTrace.stepId);
						if (existingIndex >= 0) {
							trace.steps[existingIndex] = inProgressTrace;
						} else {
							trace.steps.push(inProgressTrace);
						}
						onTraceUpdate?.(trace);
					});
				})
			);

			this.logStepCompletion(startTime, Date.now());

			// Process results -- stop on first failure or loop
			let nextReady: ReadyItem[] = [];

			for (let i = 0; i < readyItems.length; i++) {
				const item = readyItems[i]!;
				const stepTrace = stepTraces[i]!;

				// Add step trace (may already be present from onStepTraceCreated callback)
				if (!trace.steps.includes(stepTrace)) {
					trace.steps.push(stepTrace);
				}
				onTraceUpdate?.(trace);

				const outcome: StepOutcome = stepTrace.error
					? { type: 'failed', error: stepTrace.error }
					: { type: 'completed', outputs: stepTrace.outputs ?? {} };

				const newReady = scheduler.complete(item.stepId, outcome);

				if (scheduler.hasFailed()) {
					trace.status = 'failed';
					trace.endTime = Date.now();

					const errorMsg = stepTrace.error
						? `Step '${item.stepId}' failed: ${stepTrace.error}`
						: `Step '${item.stepId}' failed`;

					return {
						success: false,
						trace,
						error: errorMsg,
						outputs: this.mapToObject(stepOutputs),
					};
				}

				nextReady = [...nextReady, ...newReady];
			}

			readyItems = nextReady;
		}

		// Flow succeeded
		trace.status = 'completed';
		trace.endTime = Date.now();

		console.log(`\n Flow '${flow.id}' completed successfully! Executed ${trace.steps.length} steps.`);

		return {
			success: true,
			trace,
			outputs: this.mapToObject(stepOutputs),
		};
	}

	/**
	 * Log step execution start
	 */
	private logStepExecution(ready: FlowStep[], startTime: number): void {
		const startDate = new Date(startTime);
		const startTimeStr = `${startDate.getHours().toString().padStart(2, '0')}:${startDate
			.getMinutes()
			.toString()
			.padStart(2, '0')}:${startDate
			.getSeconds()
			.toString()
			.padStart(2, '0')}.${startDate.getMilliseconds().toString().padStart(3, '0')}`;

		console.log(
			`\n  [${startTimeStr}] Executing ${ready.length} step(s) in parallel: ${ready.map(s => s.id).join(', ')}`
		);
	}

	/**
	 * Log step execution completion
	 */
	private logStepCompletion(startTime: number, endTime: number): void {
		const endDate = new Date(endTime);
		const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate
			.getMinutes()
			.toString()
			.padStart(2, '0')}:${endDate
			.getSeconds()
			.toString()
			.padStart(2, '0')}.${endDate.getMilliseconds().toString().padStart(3, '0')}`;

		const duration = ((endTime - startTime) / 1000).toFixed(3);
		console.log(`   [${endTimeStr}] Completed in ${duration}s`);
	}

	/**
	 * Convert Map to plain object for serialization
	 */
	private mapToObject(map: Map<string, Record<string, any>>): Record<string, Record<string, any>> {
		const obj: Record<string, Record<string, any>> = {};
		for (const [key, value] of Array.from(map.entries())) {
			obj[key] = value;
		}
		return obj;
	}
}
