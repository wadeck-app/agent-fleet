/**
 * Flow Orchestrator
 *
 * Orchestrates the execution of flow steps based on DAG dependencies.
 * Handles parallel execution, loop logic, and output management.
 */
import { v4 as uuidv4 } from 'uuid';

import { LoopHandler } from '../processing/LoopHandler';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { DAG, FlowDefinition, FlowExecutionResult, FlowStep, FlowTrace, StepTrace, Workspace } from '../types';
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
	private loopHandler: LoopHandler;
	private stepRunner: StepRunner;
	private templateRenderer: TemplateRenderer;

	constructor(stepRunner: StepRunner) {
		this.dagBuilder = new DAGBuilder();
		this.dagValidator = new DAGValidator();
		this.loopHandler = new LoopHandler();
		this.stepRunner = stepRunner;
		this.templateRenderer = new TemplateRenderer();
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
			// Build and validate DAG
			const dag = this.dagBuilder.buildDAG(flow.steps);
			const validation = this.dagValidator.validate(dag);

			if (!validation.valid) {
				const errorMessages = validation.errors.map(e => e.message).join('; ');
				throw new OrchestrationError(`DAG validation failed: ${errorMessages}`, flow.id);
			}

			// Log warnings if any
			if (validation.warnings.length > 0) {
				console.warn(`⚠️  DAG validation warnings for flow '${flow.id}':`);
				for (const warning of validation.warnings) {
					console.warn(`   - ${warning.message}`);
				}
			}

			// Execute flow
			const result = await this.executeFlow(flow, dag, workspace, context, trace, stepOutputs, onTraceUpdate);

			return result;
		} catch (error) {
			trace.status = 'failed';
			trace.endTime = Date.now();

			const errorMessage = error instanceof Error ? error.message : String(error);

			return {
				success: false,
				trace,
				error: errorMessage,
				outputs: this.mapToObject(stepOutputs),
			};
		}
	}

	/**
	 * Execute flow with DAG-based parallelization
	 */
	private async executeFlow(
		flow: FlowDefinition,
		dag: DAG,
		workspace: Workspace,
		context: TemplateContext,
		trace: FlowTrace,
		stepOutputs: Map<string, Record<string, any>>,
		onTraceUpdate?: (trace: FlowTrace) => void
	): Promise<FlowExecutionResult> {
		// Track completed steps
		const completed = new Set<string>();

		// Track loop metadata
		const iterations = new Map<string, number>();

		// Execute steps in parallel based on DAG dependencies
		while (completed.size < flow.steps.length) {
			// Find all steps whose dependencies are met
			const ready = this.dagBuilder.findReadySteps(dag, completed);

			if (ready.length === 0) {
				// No ready steps means there's an issue (shouldn't happen if validation passed)
				const remaining = flow.steps.filter(s => !completed.has(s.id));
				throw new OrchestrationError(
					`No steps ready to execute, but ${remaining.length} steps remain: ${remaining
						.map(s => s.id)
						.join(', ')}`,
					flow.id
				);
			}

			// Filter steps based on 'when' condition
			const toExecute: FlowStep[] = [];
			const toSkip: string[] = [];

			for (const step of ready) {
				if (this.shouldExecuteStep(step, context)) {
					toExecute.push(step);
				} else {
					// Mark as completed (skipped due to condition)
					completed.add(step.id);
					toSkip.push(step.id);
				}
			}

			// Log skipped steps
			if (toSkip.length > 0) {
				console.log(`   ⏭️  Skipped ${toSkip.length} step(s) (condition not met): ${toSkip.join(', ')}`);
			}

			if (toExecute.length === 0) {
				// No steps to execute, continue to next iteration
				continue;
			}

			// Log execution
			const startTime = Date.now();
			this.logStepExecution(toExecute, startTime);

			// Execute ready steps in parallel.
			// The onStepTraceCreated callback adds each step trace to trace.steps
			// as soon as it's created, BEFORE execution begins. This makes
			// liveLogEntries visible to the 500ms polling during execution.
			const stepTraces = await Promise.all(
				toExecute.map(step =>
					this.stepRunner.executeStep(step, workspace, context, inProgressTrace => {
						// Add or replace the in-progress trace for real-time visibility
						const existingIndex = trace.steps.findIndex(t => t.stepId === inProgressTrace.stepId);
						if (existingIndex >= 0) {
							// Replace (happens on retry)
							trace.steps[existingIndex] = inProgressTrace;
						} else {
							trace.steps.push(inProgressTrace);
						}
						onTraceUpdate?.(trace);
					})
				)
			);

			// Log completion
			const endTime = Date.now();
			this.logStepCompletion(startTime, endTime);

			// Process results
			const shouldContinue = this.processStepResults(
				toExecute,
				stepTraces,
				flow,
				dag,
				trace,
				stepOutputs,
				completed,
				iterations,
				onTraceUpdate
			);

			if (!shouldContinue.continue) {
				// Flow failed or needs to loop
				if (shouldContinue.result) {
					return shouldContinue.result;
				}
				// Loop - continue to next iteration
				continue;
			}
		}

		// Success!
		trace.status = 'completed';
		trace.endTime = Date.now();

		console.log(`\n✅ Flow '${flow.id}' completed successfully! Executed ${completed.size} steps.`);

		return {
			success: true,
			trace,
			outputs: this.mapToObject(stepOutputs),
		};
	}

	/**
	 * Process step execution results
	 */
	private processStepResults(
		ready: FlowStep[],
		stepTraces: StepTrace[],
		flow: FlowDefinition,
		dag: DAG,
		trace: FlowTrace,
		stepOutputs: Map<string, Record<string, any>>,
		completed: Set<string>,
		iterations: Map<string, number>,
		onTraceUpdate?: (trace: FlowTrace) => void
	): { continue: boolean; result?: FlowExecutionResult } {
		for (let i = 0; i < ready.length; i++) {
			const step = ready[i];
			const stepTrace = stepTraces[i];

			// Only add if not already present (may have been added by onStepTraceCreated callback)
			if (!trace.steps.includes(stepTrace)) {
				trace.steps.push(stepTrace);
			}

			// Notify callback of trace update (for real-time updates)
			if (onTraceUpdate) {
				onTraceUpdate(trace);
			}

			// Store outputs
			if (stepTrace.outputs) {
				stepOutputs.set(step.id, stepTrace.outputs);
			}

			// Check for errors and potential loops
			if (stepTrace.error) {
				// Check if this failure should trigger a loop
				const loopCheck = this.loopHandler.checkLoop(step, stepTrace, iterations);

				if (loopCheck.shouldLoop && loopCheck.targetStepId) {
					// Handle the loop
					const loopResult = this.loopHandler.handleLoop(
						step,
						loopCheck.targetStepId,
						dag,
						completed,
						iterations
					);

					if (!loopResult.success) {
						// Loop handling failed
						trace.status = 'failed';
						trace.endTime = Date.now();
						return {
							continue: false,
							result: {
								success: false,
								trace,
								error: `Loop handling failed: ${loopResult.error}`,
								outputs: this.mapToObject(stepOutputs),
							},
						};
					}

					// Loop triggered - do NOT mark step as completed
					// Continue to next iteration
					return { continue: false };
				} else {
					// No loop to trigger, or max iterations exceeded
					trace.status = 'failed';
					trace.endTime = Date.now();

					const errorMsg = loopCheck.reason?.includes('Max iterations')
						? `Step '${step.id}' failed: ${stepTrace.error}. ${loopCheck.reason}`
						: `Step '${step.id}' failed: ${stepTrace.error}`;

					return {
						continue: false,
						result: {
							success: false,
							trace,
							error: errorMsg,
							outputs: this.mapToObject(stepOutputs),
						},
					};
				}
			}

			// Step completed successfully
			// Check if this step's success should reset any iteration counters
			this.loopHandler.handleResetOnSuccess(step.id, flow.steps, iterations);

			// Mark as completed
			completed.add(step.id);
		}

		return { continue: true };
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
			`\n▶️  [${startTimeStr}] Executing ${ready.length} step(s) in parallel: ${ready.map(s => s.id).join(', ')}`
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
		console.log(`   ⏱️  [${endTimeStr}] Completed in ${duration}s`);
	}

	/**
	 * Evaluate if a step should be executed based on its 'when' condition
	 */
	private shouldExecuteStep(step: FlowStep, context: TemplateContext): boolean {
		// If no 'when' condition, always execute
		if (!step.when) {
			return true;
		}

		try {
			let condition = step.when.trim();

			// Strip template syntax if present: ${{ expression }} → expression
			if (condition.startsWith('${{') && condition.endsWith('}}')) {
				condition = condition.slice(3, -2).trim();
			}

			// Build evaluation context with steps, inputs, task
			// Convert Map to object for easier access
			// Wrap outputs in 'outputs' property to match GitHub Actions syntax: steps.stepId.outputs.outputName
			const stepsObj: Record<string, Record<string, any>> = {};
			for (const [stepId, outputs] of context.stepOutputs.entries()) {
				stepsObj[stepId] = { outputs };
			}

			// Evaluate the condition as JavaScript with context
			// e.g., "steps.calculate.outputs.continue === 'true'"
			const evalFunction = new Function('steps', 'inputs', 'task', `"use strict"; return (${condition});`);

			const result = evalFunction(stepsObj, context.inputs || {}, context.taskMetadata || {});

			if (typeof result !== 'boolean') {
				console.warn(
					`⚠️  Step '${step.id}' condition '${step.when}' evaluated to non-boolean: ${typeof result}. Treating as false.`
				);
				return false;
			}

			return result;
		} catch (error) {
			console.error(
				`❌ Failed to evaluate condition for step '${step.id}': ${error instanceof Error ? error.message : String(error)}`
			);
			console.error(`   Condition: ${step.when}`);
			// On error, skip the step (safe default)
			return false;
		}
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
