import type { StepRunner } from 'flow-engine';
import type { TemplateContext } from 'flow-engine/processing/TemplateRenderer';
import type { ModelFlowStep, ScriptFlowStep, Workspace } from 'flow-engine/types';

import type { AssignableStep, ExecutionContext, InjectedStep, WorkerToDaemon } from '../ipc/Protocol';
import { McpServer } from './McpServer';

export type SendMessageFn = (msg: WorkerToDaemon) => void;

// Factory that creates a StepRunner configured for the given MCP config path.
// Pass an empty string when no MCP server is needed (script steps).
export type StepRunnerFactory = (mcpConfigPath: string) => StepRunner;

export class WorkerAdapter {
	private readonly stepRunnerFactory: StepRunnerFactory;

	constructor(stepRunnerFactory: StepRunnerFactory) {
		this.stepRunnerFactory = stepRunnerFactory;
	}

	async execute(
		step: AssignableStep,
		context: ExecutionContext,
		sendMessage: SendMessageFn
	): Promise<Record<string, unknown>> {
		if (step.type === 'subflow') {
			throw new Error(`Step type 'subflow' is not supported in v1`);
		}

		// Build a minimal Workspace for flow-engine's StepRunner
		const workspace: Workspace = {
			id: `ws-${context.executionId}`,
			path: context.workspaceDir,
			mode: 'manual',
			concurrency: { key: context.executionId, activeTasks: new Set<string>(), locked: false },
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		// Build TemplateContext for flow-engine
		// stepOutputs is a Map in TemplateContext (not a plain object)
		const templateContext: TemplateContext = {
			inputs: context.inputs,
			stepOutputs: new Map(Object.entries(context.stepOutputs)),
			taskMetadata: {},
		};

		// For model steps, wire up the MCP server for provideSteps injection
		if (step.type === 'model') {
			const onInjectSteps = async (steps: InjectedStep[]): Promise<void> => {
				sendMessage({ type: 'inject_steps', executionId: context.executionId, steps });
			};

			const mcpServer = new McpServer(context.executionId, onInjectSteps);
			const { configPath: mcpConfigPath } = await mcpServer.start();

			// Create a runner with MCP config path baked into the factory call
			const runner = this.stepRunnerFactory(mcpConfigPath);

			try {
				const trace = await runner.executeStep(step as unknown as ModelFlowStep, workspace, templateContext);
				// trace.outputs is undefined for model steps that produce no structured output —
				// an empty map is the correct representation (no outputs to propagate to dependents).
				return (trace.outputs ?? {}) as Record<string, unknown>;
			} finally {
				// Suppress stop errors so they do not shadow the original executeStep error.
				try {
					await mcpServer.stop();
				} catch {
					/* ignore cleanup errors */
				}
			}
		}

		const runner = this.stepRunnerFactory('');
		const trace = await runner.executeStep(step as unknown as ScriptFlowStep, workspace, templateContext);
		// trace.outputs is undefined for script steps without captureOutput — empty map is correct.
		return (trace.outputs ?? {}) as Record<string, unknown>;
	}
}
