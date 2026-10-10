import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

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
	/** Called with the fully-rendered prompt before the model CLI is launched. Use for debug logging. */
	onRenderedPrompt?: (prompt: string) => void;
	/**
	 * Which provider ran the step, for error messages.
	 *
	 * Failures used to read "Claude exited with code 1" whatever the provider, which sends anyone
	 * debugging an opencode or codex step looking at the wrong CLI. Defaults to the step's
	 * declared provider name when omitted.
	 */
	providerName?: string;
	/**
	 * The step's model after family names like "sonnet" have been resolved for this provider.
	 *
	 * Resolved by the caller because that is where the provider is known (see `ModelAliases`).
	 * Absent means "use `step.model` as written", which is what every existing caller does.
	 */
	resolvedModel?: string;
}

/**
 * Races `promise` against `step.timeout` (minutes). If the timer fires first, kills the
 * provider's underlying process and rejects with an actionable message naming the step,
 * provider, model, and configured timeout -- a hang must never surface as a generic failure.
 * No-op (returns `promise` as-is) when `step.timeout` is unset.
 */
function withModelTimeout<T>(
	promise: Promise<T>,
	step: ModelFlowStep,
	provider: ModelProvider,
	providerLabel: string,
	effectiveModel: string | undefined
): Promise<T> {
	const timeoutMinutes = step.timeout;
	if (!timeoutMinutes) return promise;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			provider.kill();
			reject(
				new Error(
					`Model step '${step.id}' (provider: ${providerLabel}, model: ${effectiveModel ?? 'default'}) timed out after ${timeoutMinutes} minute(s) with no response -- killed.`
				)
			);
		}, timeoutMinutes * 60_000);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
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

	// What actually gets called. Recorded rather than the step's wording so the trace answers
	// "which model ran this?" -- a step saying `model: sonnet` otherwise leaves no record of
	// which sonnet it was.
	const effectiveModel = config.resolvedModel ?? step.model;
	// Names the CLI that actually ran, so a failing opencode step does not report "Claude".
	const providerLabel = config.providerName ?? step.provider ?? 'claude';

	const renderedPrompt = templateRenderer.render(step.prompt, context, true);
	stepTrace.prompt = renderedPrompt;
	stepTrace.model = effectiveModel;

	// Emit the rendered prompt before launching the model so callers can forward it
	// to the execution log. The format starts with "[rendered prompt]\n" for easy filtering.
	config.onRenderedPrompt?.(renderedPrompt);

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
	let capturedCacheReadTokens = 0;
	let capturedCacheWriteTokens = 0;
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
		model: effectiveModel,
		env: (() => {
			const merged = { ...(config.claudeEnv ?? {}), ...(step.env ?? {}) };
			return Object.keys(merged).length > 0 ? merged : undefined;
		})(),
		// Merge config-level servers (e.g. the provideSteps daemon server) with step-level servers
		mcpServers: [...(config.mcpServers ?? []), ...(step.mcpServers ?? [])],
		toolHooks: step.toolHooks ?? [],
		tools: step.tools,
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
							// Claude's own CLI names this `total_cost_usd` in its native stream-json result event
							// (see claude-mock.mjs). OpenCode/Codex synthesize their own event with `cost_usd`
							// instead -- support both so neither provider regresses.
							capturedCostUsd =
								(event.data.total_cost_usd as number) ?? (event.data.cost_usd as number) ?? 0;
							const usage = event.data.modelUsage as
								| Record<
										string,
										{
											inputTokens?: number;
											outputTokens?: number;
											// Claude's native modelUsage entries use the `*InputTokens` names below.
											// OpenCode/Codex synthesize their own modelUsage with `cacheReadTokens` /
											// `cacheWriteTokens` instead -- read both so neither provider regresses.
											cacheReadInputTokens?: number;
											cacheCreationInputTokens?: number;
											cacheReadTokens?: number;
											cacheWriteTokens?: number;
										}
								  >
								| undefined;
							if (usage) {
								for (const u of Object.values(usage)) {
									capturedInputTokens += u.inputTokens ?? 0;
									capturedOutputTokens += u.outputTokens ?? 0;
									capturedCacheReadTokens += u.cacheReadInputTokens ?? u.cacheReadTokens ?? 0;
									capturedCacheWriteTokens += u.cacheCreationInputTokens ?? u.cacheWriteTokens ?? 0;
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
		model: effectiveModel ?? '',
		session_id: capturedSessionId,
		session_file: capturedSessionFile,
		ttft_ms: capturedTtftMs,
		duration_ms: stepTrace.durationMs || Math.max(1, (stepTrace.endTime ?? Date.now()) - stepTrace.startTime),
		cost: {
			input_tokens: capturedInputTokens,
			output_tokens: capturedOutputTokens,
			cache_read_tokens: capturedCacheReadTokens,
			cache_write_tokens: capturedCacheWriteTokens,
			usd: capturedCostUsd,
		},
	});

	try {
		if (config.interactive) {
			const result = await withModelTimeout(
				provider.launchInteractive(launchOptions),
				step,
				provider,
				providerLabel,
				effectiveModel
			);

			stepTrace.response = result.response;
			stepTrace.exitCode = result.exitCode ?? undefined;
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			stepTrace.meta = buildModelMeta();

			if (result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null) {
				stepTrace.error = `${providerLabel} exited with code ${result.exitCode}`;
				return stepTrace;
			}

			stepTrace.outputs = outputExtractor.extract(result.response, step.output, step.id, {
				rawOutput: result.response,
				response: result.response,
			});
			writeOutputFiles(stepTrace.outputs ?? {}, step.output, context);
			return stepTrace;
		} else {
			const result = await withModelTimeout(
				provider.launchBackground(launchOptions),
				step,
				provider,
				providerLabel,
				effectiveModel
			);

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
				stepTrace.error = `${providerLabel} exited with code ${result.exitCode}\n${result.stderr}`;
				return stepTrace;
			}

			stepTrace.outputs = outputExtractor.extract(responseText, step.output, step.id, {
				rawOutput: responseText,
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
		stepTrace.error = normalizeError(error).message;
		return stepTrace;
	}
}
