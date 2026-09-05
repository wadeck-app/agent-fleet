import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { McpServer, ModelProvider } from '../processing/ModelProvider';
import type { OutputExtractor } from '../processing/OutputExtractor';
import { StreamEventMapper } from '../processing/StreamEventMapper';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { ExecutionConfig, LiveLogEntry, ModelFlowStep, ModelStepMeta, StepTrace } from '../types';
import { writeOutputFiles } from './ScriptStepExecutor';

export interface ModelStepConfig {
	interactive: boolean;
	claudeEnv?: Record<string, string>;
	mcpServers?: McpServer[];
	provider: ModelProvider;
	onClaudeProcessStarted?: (process: import('node:child_process').ChildProcess) => void;
	executionConfig?: ExecutionConfig;
}

export async function executeModelStep(
	step: ModelFlowStep,
	workspacePath: string,
	context: TemplateContext,
	stepTrace: StepTrace,
	config: ModelStepConfig,
	services: {
		templateRenderer: TemplateRenderer;
		outputExtractor: OutputExtractor;
	},
	onLogEntry?: (entry: LiveLogEntry) => void
): Promise<StepTrace> {
	const { templateRenderer, outputExtractor } = services;
	const provider = config.provider;

	const renderedPrompt = templateRenderer.render(step.prompt, context, true);
	stepTrace.prompt = renderedPrompt;
	stepTrace.model = step.model;

	const execConfig = config.executionConfig;
	const streamJson = execConfig?.streamJson !== false;
	const verbose = execConfig?.verbose !== false;
	const skipPermissions = execConfig?.skipPermissions === true;

	let finalResultText: string | undefined;
	const liveLogEntries: LiveLogEntry[] = [];
	let streamEventMapper: StreamEventMapper | undefined;
	const logMode = step.log ?? 'end';

	let capturedSessionId = '';
	let capturedSessionFile = '';
	let capturedCostUsd = 0;
	let capturedInputTokens = 0;
	let capturedOutputTokens = 0;
	let capturedTtftMs = 0;
	const modelStartTime = Date.now();

	if (streamJson && !config.interactive) {
		if (logMode !== 'none') {
			stepTrace.liveLogEntries = liveLogEntries;
			streamEventMapper = new StreamEventMapper(step.id);
		}
	}

	let pollingInterval: ReturnType<typeof setInterval> | undefined;
	const pollingBuffer: LiveLogEntry[] = [];
	if (logMode === 'polling' && onLogEntry) {
		pollingInterval = setInterval(() => {
			const batch = pollingBuffer.splice(0);
			for (const e of batch) onLogEntry(e);
		}, 500);
	}

	let resumeSessionId: string | undefined;
	if (step.session?.continue) {
		const prevMeta = context.stepMeta?.get(step.session.continue);
		const prevSessionId = prevMeta?.['session_id'] as string | undefined;
		const prevSessionFile = prevMeta?.['session_file'] as string | undefined;

		if (step.session.mode === 'append' || step.session.mode === 'compact') {
			if (typeof prevSessionId === 'string' && prevSessionId) {
				resumeSessionId = prevSessionId;
			}
		} else if (step.session.mode === 'fork') {
			if (prevSessionFile && fs.existsSync(prevSessionFile)) {
				const conversationsDir = path.dirname(prevSessionFile);
				const forkId = randomUUID();
				const forkFile = path.join(conversationsDir, `${forkId}.jsonl`);
				fs.copyFileSync(prevSessionFile, forkFile);
				resumeSessionId = forkId;
			} else if (typeof prevSessionId === 'string' && prevSessionId) {
				process.stderr.write(
					`[ModelStepExecutor] session.mode:fork -- session_file not found for step '${step.session.continue}', falling back to append\n`
				);
				resumeSessionId = prevSessionId;
			}
		}
	}

	const launchOptions = {
		workingDir: workspacePath,
		prompt: renderedPrompt,
		stepId: step.id,
		model: step.model,
		env: config.claudeEnv && Object.keys(config.claudeEnv).length > 0 ? config.claudeEnv : undefined,
		// Merge config-level servers (e.g. the provideSteps daemon server) with step-level servers
		mcpServers: [...(config.mcpServers ?? []), ...(step.mcpServers ?? [])],
		toolHooks: step.toolHooks ?? [],
		onProcessStarted: config.onClaudeProcessStarted,
		streamJson: streamJson && !config.interactive,
		verbose: verbose && !config.interactive,
		skipPermissions,
		autoCompact: step.session?.mode === 'compact',
		resumeSessionId,
		onStreamEvent:
			streamJson && !config.interactive
				? (event: import('../processing/StreamJsonParser').StreamJsonEvent) => {
						if (event.type === 'result' && event.data.result !== undefined && event.data.result !== null) {
							finalResultText = event.data.result;
						}
						if (event.type === 'system' && event.data.session_id) {
							capturedSessionId = event.data.session_id as string;
							capturedTtftMs = Date.now() - modelStartTime;
							const memoryPathAuto = (event.data.memory_paths as Record<string, string> | undefined)
								?.auto;
							if (memoryPathAuto) {
								const projectDir = memoryPathAuto.replace(/[/\\]memory[/\\]?$/, '');
								capturedSessionFile = path.join(projectDir, capturedSessionId + '.jsonl');
							}
						}
						if (event.type === 'result') {
							capturedCostUsd = (event.data.cost_usd as number) ?? 0;
							const usage = event.data.modelUsage as
								Record<string, { inputTokens?: number; outputTokens?: number }> | undefined;
							if (usage) {
								for (const u of Object.values(usage)) {
									capturedInputTokens += u.inputTokens ?? 0;
									capturedOutputTokens += u.outputTokens ?? 0;
								}
							}
						}
						if (logMode === 'none') return;
						const entries = streamEventMapper?.map(event) ?? [];
						for (const entry of entries) {
							liveLogEntries.push(entry);
							if (logMode === 'streaming' && onLogEntry) onLogEntry(entry);
							if (logMode === 'polling') pollingBuffer.push(entry);
						}
					}
				: undefined,
	};

	const buildModelMeta = (): ModelStepMeta => ({
		model: step.model ?? '',
		session_id: capturedSessionId,
		session_file: capturedSessionFile,
		ttft_ms: capturedTtftMs,
		duration_ms: stepTrace.durationMs || Math.max(1, (stepTrace.endTime ?? Date.now()) - stepTrace.startTime),
		cost: {
			input_tokens: capturedInputTokens,
			output_tokens: capturedOutputTokens,
			usd: capturedCostUsd,
		},
	});

	try {
		if (config.interactive) {
			const result = await provider.launchInteractive(launchOptions);

			stepTrace.response = result.response;
			stepTrace.exitCode = result.exitCode ?? undefined;
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.meta = buildModelMeta();

			if (result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null) {
				stepTrace.error = `Claude exited with code ${result.exitCode}`;
				return stepTrace;
			}

			stepTrace.outputs = outputExtractor.extract(result.response, step.output, step.id, {
				response: result.response,
			});
			writeOutputFiles(stepTrace.outputs ?? {}, step.output, context);
			return stepTrace;
		} else {
			const result = await provider.launchBackground(launchOptions);

			if (pollingInterval) {
				clearInterval(pollingInterval);
				const remaining = pollingBuffer.splice(0);
				if (onLogEntry) for (const e of remaining) onLogEntry(e);
			}

			const responseText = streamJson && finalResultText != null ? finalResultText : result.stdout;

			stepTrace.response = responseText;
			stepTrace.stdout = result.stdout;
			stepTrace.stderr = result.stderr;
			stepTrace.exitCode = result.exitCode;
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.meta = buildModelMeta();

			if (stepTrace.liveLogEntries) {
				stepTrace.liveLogEntries = StreamEventMapper.capEntries(stepTrace.liveLogEntries);
			}

			if (result.exitCode !== 0) {
				stepTrace.error = `Claude exited with code ${result.exitCode}\n${result.stderr}`;
				return stepTrace;
			}

			stepTrace.outputs = outputExtractor.extract(responseText, step.output, step.id, {
				response: responseText,
				stdout: result.stdout,
				stderr: result.stderr,
			});
			stepTrace.response = responseText;
			writeOutputFiles(stepTrace.outputs ?? {}, step.output, context);
			return stepTrace;
		}
	} catch (error) {
		if (pollingInterval) clearInterval(pollingInterval);
		stepTrace.endTime = Date.now();
		stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
		stepTrace.error = error instanceof Error ? error.message : String(error);
		return stepTrace;
	}
}
