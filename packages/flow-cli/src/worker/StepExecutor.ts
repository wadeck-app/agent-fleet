import { ScriptExecutor } from 'flow-engine/src/executor/ScriptExecutor.js';
import { ClaudeLauncher } from 'flow-engine/src/processing/ClaudeLauncher.js';
import { OutputExtractor } from 'flow-engine/src/processing/OutputExtractor.js';
import type { StreamJsonEvent } from 'flow-engine/src/processing/StreamJsonParser.js';
import { TemplateRenderer } from 'flow-engine/src/processing/TemplateRenderer.js';

import type { AssignableStep, ExecutionContext, InjectedStep, WorkerToDaemon } from '../ipc/Protocol.js';
import { McpServer } from './McpServer.js';

export type McpServerFactory = (
	executionId: string,
	onInjectSteps: (steps: InjectedStep[]) => Promise<void>
) => McpServer;

// D31 (v1): LogMasker is not wired into this output path. Secret values in step output
// may appear in plaintext in logs and execution state files. Tracked for v2.

export class UnsupportedStepTypeError extends Error {
	constructor(type: string) {
		super(`Step type '${type}' is not supported in v1`);
		this.name = 'UnsupportedStepTypeError';
	}
}

export class StepExecutor {
	private readonly scriptExecutor = new ScriptExecutor();
	private readonly claudeLauncher = new ClaudeLauncher();
	private readonly outputExtractor = new OutputExtractor();
	private readonly templateRenderer = new TemplateRenderer();
	private readonly mcpServerFactory: McpServerFactory;

	constructor(
		private readonly sendMessage: (msg: WorkerToDaemon) => void,
		mcpServerFactory?: McpServerFactory
	) {
		this.mcpServerFactory =
			mcpServerFactory ?? ((executionId, onInjectSteps) => new McpServer(executionId, onInjectSteps));
	}

	async execute(step: AssignableStep, context: ExecutionContext): Promise<Record<string, unknown>> {
		switch (step.type) {
			case 'script':
				return this.executeScript(step, context);
			case 'model':
				return this.executeModel(step, context);
			case 'subflow':
				throw new UnsupportedStepTypeError('subflow');
			default: {
				const _exhaustive: never = step;
				throw new Error(`Unknown step type: ${JSON.stringify(_exhaustive)}`);
			}
		}
	}

	private async executeScript(
		step: Extract<AssignableStep, { type: 'script' }>,
		context: ExecutionContext
	): Promise<Record<string, unknown>> {
		// D31: step.env values may contain ${{ secrets.name }} or ${{ vars.name }} expressions.
		// Template rendering and secret resolution for env vars are not implemented in v1 —
		// env values are passed as literal strings. Tracked for v2.
		const result = await this.scriptExecutor.execute({
			script: step.script,
			workingDir: step.workingDir ?? context.workspaceDir,
			env: step.env ?? {},
			isolateEnv: true,
		});

		return this.outputExtractor.extract(result.stdout, step.output, step.id, {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
		});
	}

	private async executeModel(
		step: Extract<AssignableStep, { type: 'model' }>,
		context: ExecutionContext
	): Promise<Record<string, unknown>> {
		const templateContext = { inputs: context.inputs, steps: context.stepOutputs };
		// D31: vars: block is not yet resolved. ${{ vars.name }} will be undefined in v1.
		// Tracked for v2: add VarsProvider and pass vars to templateContext.
		const renderedPrompt = this.templateRenderer.render(step.prompt, templateContext);

		let fullResponse = '';
		let sessionId: string | undefined;

		const onInjectSteps = async (steps: InjectedStep[]): Promise<void> => {
			this.sendMessage({ type: 'inject_steps', executionId: context.executionId, steps });
		};

		const mcpServer = this.mcpServerFactory(context.executionId, onInjectSteps);
		const { configPath: mcpConfigPath } = await mcpServer.start();

		const handleStreamEvent = (event: StreamJsonEvent): void => {
			if (event.type === 'system' && event.data.session_id) {
				sessionId = String(event.data.session_id);
			}
			if (event.type === 'assistant') {
				const content = event.data.message?.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (block.type === 'text' && typeof block.text === 'string') {
							fullResponse += block.text;
							this.sendMessage({
								type: 'log',
								executionId: context.executionId,
								stepId: step.id,
								entry: {
									type: 'stdout',
									content: block.text,
									timestamp: new Date().toISOString(),
								},
							});
						}
					}
				}
			}
		};

		try {
			// D31: step.env is not passed to model steps in v1. Tracked for v2.
			// D25: multi-shot output extraction retry (up to maxOutputRetries, using --resume <sessionId>)
			// is not implemented in v1. OutputExtractionError propagates directly as step_failed.
			// sessionId is captured above and available for future retry implementation.
			const result = await this.claudeLauncher.launchBackground({
				prompt: renderedPrompt,
				model: step.model,
				workingDir: context.workspaceDir,
				stepId: step.id,
				streamJson: true,
				isolateEnv: true,
				env: {},
				onStreamEvent: handleStreamEvent,
				mcpConfigPath,
			});

			return this.outputExtractor.extract(fullResponse || result.stdout, step.output, step.id, {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
				sessionId,
			});
		} finally {
			await mcpServer.stop();
		}
	}
}
