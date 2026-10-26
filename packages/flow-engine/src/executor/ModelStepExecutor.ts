import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import {
	DEFAULT_COMPACT_HOOK_TIMEOUT_SECONDS,
	extractCompactEvent,
	runCompactHook,
	validateOnCompact,
} from '../processing/CompactHook';
import { buildContextLimitEnv, haikuContextLimitWarning, validateContextLimit } from '../processing/ContextLimit';
import type { McpServer, ModelProvider } from '../processing/ModelProvider';
import type { OutputExtractor } from '../processing/OutputExtractor';
import { StepMetricsCollector } from '../processing/StepMetricsCollector';
import { StreamEventMapper } from '../processing/StreamEventMapper';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import { ToolCallTracker, type ToolProgress } from '../processing/ToolCallTracker';
import type {
	AttemptEndReason,
	ExecutionConfig,
	LiveLogEntry,
	ModelFlowStep,
	ModelStepMeta,
	StepTrace,
} from '../types';
import { writeOutputFiles } from './ScriptStepExecutor';
import { buildSubStepRelaunch } from './SubStepRelaunch';

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
	/**
	 * Milliseconds a claude process may keep running after its final `result` event before it is
	 * ended (default {@link DEFAULT_RESULT_GRACE_MS}). Only read by the claude launcher.
	 */
	resultGraceMs?: number;
}

/** The step's `timeout` fired; told apart from any other failure so the attempt is recorded as a timeout. */
class ModelStepTimeoutError extends Error {}

/**
 * Fails an attempt that was refused before anything was launched (invalid configuration, relaunch without a
 * session). It still carries a meta, so every failed model step reports one and a missing one can only mean an
 * older worker.
 */
function rejectedBeforeLaunch(stepTrace: StepTrace, effectiveModel: string | undefined, error: string): StepTrace {
	stepTrace.error = error;
	stepTrace.endTime = Date.now();
	stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
	stepTrace.meta = {
		model: effectiveModel ?? '',
		session_id: '',
		session_file: '',
		ttft_ms: 0,
		duration_ms: Math.max(1, stepTrace.durationMs),
		cost: {
			input_tokens: 0,
			output_tokens: 0,
			cache_read_tokens: 0,
			cache_write_tokens: 0,
			usd: 0,
			reported: false,
		},
		end_reason: 'step_error',
	} satisfies ModelStepMeta;
	return stepTrace;
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
				new ModelStepTimeoutError(
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
	onLogEntry?: (entry: LiveLogEntry) => void,
	/**
	 * Called on every stream event, regardless of `step.log`/`toolLog` display settings.
	 *
	 * The daemon's stall watchdog hears about a step only through forwarded log entries, which
	 * `log: 'end'` (the default) never forwards and `toolLog: 'none'` (the default) strips tool
	 * activity from even in `log: 'streaming'` -- so a healthy tool-call-only, no-narration turn
	 * can go fully silent and get killed as stuck. This exists so "is the provider doing anything"
	 * stays independent of "what should be displayed".
	 *
	 * Also says which tool call is in flight ({@link ToolCallTracker}), so a stall can name it.
	 */
	onActivity?: (progress: ToolProgress) => void
): Promise<StepTrace> {
	const { templateRenderer, outputExtractor } = services;
	const provider = config.provider;

	// What actually gets called. Recorded rather than the step's wording so the trace answers
	// "which model ran this?" -- a step saying `model: sonnet` otherwise leaves no record of
	// which sonnet it was.
	const effectiveModel = config.resolvedModel ?? step.model;
	// Names the CLI that actually ran, so a failing opencode step does not report "Claude".
	const providerLabel = config.providerName ?? step.provider ?? 'claude';
	// Same identity, used for routing decisions rather than display -- providerLabel can be
	// overridden by config.providerName, which must not change what contextLimit validates.
	const actualProvider = step.provider ?? 'claude';

	// A relaunch caused by a failed sub-step continues the previous session with only the feedback:
	// the original prompt is neither rendered nor sent again.
	let renderedPrompt: string;
	let relaunchSessionId: string | undefined;
	if (context.subStepRelaunch !== undefined) {
		const relaunch = buildSubStepRelaunch({
			step,
			feedback: context.subStepRelaunch.feedback,
			context,
			provider,
			providerLabel,
			templateRenderer,
		});
		if ('error' in relaunch) {
			return rejectedBeforeLaunch(stepTrace, effectiveModel, relaunch.error);
		}
		renderedPrompt = relaunch.message;
		relaunchSessionId = relaunch.resumeSessionId;
	} else {
		renderedPrompt = templateRenderer.render(step.prompt, context, true);
	}
	stepTrace.prompt = renderedPrompt;
	stepTrace.model = effectiveModel;

	// Emit the rendered prompt before launching the model so callers can forward it
	// to the execution log. The format starts with "[rendered prompt]\n" for easy filtering.
	config.onRenderedPrompt?.(renderedPrompt);

	if (step.contextLimit !== undefined) {
		try {
			validateContextLimit({
				contextLimit: step.contextLimit,
				provider: actualProvider,
				stepEnv: step.env,
				claudeEnv: config.claudeEnv,
				sessionMode: step.session?.mode,
			});
		} catch (err) {
			return rejectedBeforeLaunch(stepTrace, effectiveModel, normalizeError(err).message);
		}
	}
	if (step.onCompact !== undefined) {
		try {
			validateOnCompact({ onCompact: step.onCompact, provider: actualProvider });
		} catch (err) {
			return rejectedBeforeLaunch(stepTrace, effectiveModel, normalizeError(err).message);
		}
	}
	// Awaited before the step returns so no hook command outlives its step; each is bounded by its
	// own timeout. Never awaited mid-step, so a slow hook cannot delay the next model call.
	const pendingCompactHooks: Promise<void>[] = [];
	const haikuWarning = haikuContextLimitWarning({
		provider: actualProvider,
		model: effectiveModel,
		contextLimit: step.contextLimit,
		stepEnv: step.env,
		claudeEnv: config.claudeEnv,
	});
	if (haikuWarning !== undefined) {
		process.stderr.write(`[warn] ${haikuWarning}\n`);
	}

	const execConfig = config.executionConfig;
	const streamJson = execConfig?.streamJson !== false;
	const verbose = execConfig?.verbose !== false;
	// Per-step, not flow-level: see ModelFlowStep.skipPermissions for why.
	const skipPermissions = step.skipPermissions === true;

	let finalResultText: string | undefined;
	const liveLogEntries: LiveLogEntry[] = [];
	let streamEventMapper: StreamEventMapper | undefined;
	const logMode = step.log ?? 'end';

	let capturedSessionId = '';
	let capturedSessionFile = '';
	let capturedCostUsd = 0;
	// True once a result event carried a cost; false means `capturedCostUsd` is a placeholder 0, not a measurement.
	let capturedCostReported = false;
	let capturedInputTokens = 0;
	let capturedOutputTokens = 0;
	let capturedCacheReadTokens = 0;
	let capturedCacheWriteTokens = 0;
	// Time from launch to the first assistant content; undefined until one is seen.
	let capturedTtftMs: number | undefined;
	// True when the provider's own result event flags the turn as an error (e.g. Claude's
	// `is_error: true`) despite exiting 0 with a `subtype: "success"` -- auto-compact
	// thrashing (`terminal_reason: "rapid_refill_breaker"`) is the known case. Neither the
	// exit-code check nor the empty-output guard below catch this: the process exits 0 and
	// usually still produced text/tokens, just not a real answer.
	let capturedIsError = false;
	const modelStartTime = Date.now();

	// Only a streamed, non-interactive run shows its events: otherwise nothing is observable, so nothing is reported.
	const metrics = streamJson && !config.interactive ? new StepMetricsCollector(actualProvider) : undefined;

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

	// The parent's own previous session wins over `session.continue`: that one only applies to a
	// first launch, and the relaunch continues the conversation the parent already has.
	let resumeSessionId: string | undefined = relaunchSessionId;
	if (relaunchSessionId === undefined && step.session?.continue) {
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

	const toolCalls = new ToolCallTracker();
	const launchOptions = {
		workingDir: workspacePath,
		prompt: renderedPrompt,
		stepId: step.id,
		model: effectiveModel,
		env: (() => {
			// contextLimit's env vars are never already present here: validateContextLimit above
			// rejects the combination, so merge order never decides which one actually wins.
			const contextLimitEnv = step.contextLimit !== undefined ? buildContextLimitEnv(step.contextLimit) : {};
			const merged = { ...(config.claudeEnv ?? {}), ...(step.env ?? {}), ...contextLimitEnv };
			return Object.keys(merged).length > 0 ? merged : undefined;
		})(),
		// Merge config-level servers (e.g. the provideSteps daemon server) with step-level servers
		mcpServers: [...(config.mcpServers ?? []), ...(step.mcpServers ?? [])],
		toolHooks: step.toolHooks ?? [],
		tools: step.tools,
		permission: step.permission,
		onProcessStarted: config.onClaudeProcessStarted,
		resultGraceMs: config.resultGraceMs,
		streamJson: streamJson && !config.interactive,
		verbose: verbose && !config.interactive,
		skipPermissions,
		autoCompact: step.session?.mode === 'compact',
		resumeSessionId,
		onStreamEvent:
			streamJson && !config.interactive
				? (event: import('../processing/StreamJsonParser').StreamJsonEvent) => {
						metrics?.observe(event);
						if (onActivity !== undefined) {
							const changed = toolCalls.observe(event);
							onActivity({ ...toolCalls.state(), changed });
						}
						const onCompact = step.onCompact;
						if (onCompact !== undefined) {
							const compactEvent = extractCompactEvent(event);
							if (compactEvent !== undefined) {
								pendingCompactHooks.push(
									runCompactHook({
										command: onCompact.command,
										timeoutMs: (onCompact.timeout ?? DEFAULT_COMPACT_HOOK_TIMEOUT_SECONDS) * 1000,
										cwd: workspacePath,
										env: stringEnv({
											...process.env,
											...(config.claudeEnv ?? {}),
											...(step.env ?? {}),
										}),
										event: compactEvent,
										context: { stepId: step.id, taskId: context.taskId },
										onWarning: message => process.stderr.write(`[warn] ${message}\n`),
									})
								);
							}
						}
						// TTFT = time from launch to the FIRST assistant content ('assistant' for claude,
						// 'text' for opencode/codex). It used to be set by every system event carrying a
						// session_id (claude emits several: init, hook events, ...), so it ended up near
						// the step duration. Never taken from 'system' events: init precedes any output.
						if (capturedTtftMs === undefined && (event.type === 'assistant' || event.type === 'text')) {
							capturedTtftMs = Date.now() - modelStartTime;
						}
						if (event.type === 'result' && event.data.result !== undefined && event.data.result !== null) {
							finalResultText = event.data.result;
						}
						if (event.type === 'system' && event.data.session_id) {
							capturedSessionId = event.data.session_id as string;
							const memoryPathAuto = (event.data.memory_paths as Record<string, string> | undefined)
								?.auto;
							if (memoryPathAuto) {
								const projectDir = memoryPathAuto.replace(/[/\\]memory[/\\]?$/, '');
								capturedSessionFile = path.join(projectDir, capturedSessionId + '.jsonl');
							}
						}
						if (event.type === 'result') {
							// Claude sets this true on a turn that failed internally (e.g. auto-compact
							// thrashing, terminal_reason: "rapid_refill_breaker") while still exiting 0
							// with subtype: "success" -- read here since nothing else surfaces it.
							if (event.data.is_error === true) {
								capturedIsError = true;
							}
							// Claude's own CLI names this `total_cost_usd` in its native stream-json result event
							// (see claude-mock.mjs). OpenCode/Codex synthesize their own event with `cost_usd`
							// instead -- support both so neither provider regresses.
							capturedCostUsd =
								(event.data.total_cost_usd as number) ?? (event.data.cost_usd as number) ?? 0;
							// codex synthesizes `cost_usd: 0` because it reports no cost at all: that 0 is not a measurement
							capturedCostReported =
								actualProvider !== 'codex' &&
								(typeof event.data.total_cost_usd === 'number' ||
									typeof event.data.cost_usd === 'number');
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
							// A later result (follow-up turn after a background-task notification) replaces
							// the earlier one: its figures describe the whole process so far, so adding
							// them to the first result's would count that turn twice. Unverified against a
							// real claude: only the mock's follow-up turn has been observed.
							capturedInputTokens = 0;
							capturedOutputTokens = 0;
							capturedCacheReadTokens = 0;
							capturedCacheWriteTokens = 0;
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

	const buildModelMeta = (endReason: AttemptEndReason): ModelStepMeta => {
		const observed = metrics?.snapshot();
		return {
			model: effectiveModel ?? '',
			session_id: capturedSessionId,
			session_file: capturedSessionFile,
			ttft_ms: capturedTtftMs ?? 0,
			duration_ms: stepTrace.durationMs || Math.max(1, (stepTrace.endTime ?? Date.now()) - stepTrace.startTime),
			cost: {
				input_tokens: capturedInputTokens,
				output_tokens: capturedOutputTokens,
				cache_read_tokens: capturedCacheReadTokens,
				cache_write_tokens: capturedCacheWriteTokens,
				usd: capturedCostUsd,
				reported: capturedCostReported,
			},
			...(observed?.turns !== undefined && { turns: observed.turns }),
			...(observed !== undefined && { tool_calls: observed.toolCalls }),
			...(observed?.filesWritten !== undefined && {
				files_written: observed.filesWritten,
				files_written_count: observed.filesWrittenCount,
			}),
			end_reason: endReason,
		};
	};

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
			const interactiveFailed = result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null;
			stepTrace.meta = buildModelMeta(interactiveFailed ? 'exit_nonzero' : 'completed');

			if (interactiveFailed) {
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

			if (result.endedAfterResult !== undefined) {
				const message = `${providerLabel} process was ended after the final result because it kept running ${String(result.endedAfterResult.graceMs)} ms after it (likely held by a background task or child process); the step completes from that result.`;
				process.stderr.write(`[warn] step ${step.id}: ${message}\n`);
				if (logMode !== 'none') {
					const entry: LiveLogEntry = {
						id: `${step.id}-live-ended-after-result`,
						timestamp: Date.now(),
						level: 'warning',
						message,
						eventType: 'system',
					};
					liveLogEntries.push(entry);
					// The polling buffer was already flushed and its timer stopped above
					if (logMode !== 'end' && onLogEntry) onLogEntry(entry);
				}
			}

			const responseText = streamJson && finalResultText != null ? finalResultText : result.stdout;

			stepTrace.response = responseText;
			stepTrace.stdout = result.stdout;
			stepTrace.stderr = result.stderr;
			stepTrace.exitCode = result.exitCode;
			stepTrace.endTime = Date.now();
			stepTrace.durationMs = stepTrace.endTime - stepTrace.startTime;
			// The reason is settled below, once the checks that can fail an exit 0 have run
			const meta = buildModelMeta('completed');
			stepTrace.meta = meta;

			if (stepTrace.liveLogEntries) {
				stepTrace.liveLogEntries = StreamEventMapper.capEntries(stepTrace.liveLogEntries);
			}

			if (result.exitCode !== 0) {
				meta.end_reason = 'exit_nonzero';
				stepTrace.error = `${providerLabel} exited with code ${result.exitCode}\n${result.stderr}`;
				return stepTrace;
			}

			// Checked before the empty-output guard below: a thrashing turn usually still
			// produces text and meters tokens (just not a real answer), so the empty-output
			// guard's zero-token condition would not catch it either.
			if (capturedIsError) {
				meta.end_reason = 'is_error_result';
				stepTrace.error = `${providerLabel} exited 0 and reported subtype: "success" but flagged this turn as is_error: true -- likely auto-compact thrashing (terminal_reason: "rapid_refill_breaker") rather than a real answer.`;
				return stepTrace;
			}

			// Exit 0 with no text and zero metered tokens means nothing happened -- a legitimate
			// tool-call-only turn still meters tokens for that turn, so this only catches a
			// provider that silently produced nothing, not "no final text". Only checked when
			// `streamJson` is active: capturedInputTokens/capturedOutputTokens are populated
			// exclusively inside onStreamEvent, which is itself gated on `streamJson` (see
			// launchOptions above) -- with streamJson:false they are always 0 regardless of real
			// success, which would otherwise fail every non-streaming step with legitimately
			// empty stdout (see diag_terra_stability.yml execution 77vx3aqo for the streaming case
			// this guards against).
			if (streamJson) {
				const noResponseText = responseText == null || responseText.trim() === '';
				if (noResponseText && capturedInputTokens === 0 && capturedOutputTokens === 0) {
					meta.end_reason = 'empty_output';
					// opencode's own most common cause for this exact symptom: a permission prompt
					// (e.g. external_directory) stuck in its default `ask` state, which a headless
					// worker can never answer, so the CLI eventually exits 0 having done nothing.
					// Named here because the actual pending-permission state lives only in
					// opencode's own log file, which this process has no handle on.
					const openCodeHint =
						step.provider === 'opencode'
							? ' If this step accesses a path outside the project, opencode may be stuck waiting on a permission prompt it was never asked to resolve -- set `permission` on this step (e.g. { external_directory: "allow" }) to avoid asking.'
							: '';
					stepTrace.error = `${providerLabel} exited 0 but produced no output and metered zero tokens -- treating as a failure instead of a silent empty success.${openCodeHint}`;
					return stepTrace;
				}
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
		// What was seen before the failure still counts: a timed-out attempt is not a free one
		stepTrace.meta = buildModelMeta(error instanceof ModelStepTimeoutError ? 'timeout' : 'step_error');
		return stepTrace;
	} finally {
		await Promise.allSettled(pendingCompactHooks);
	}
}

/** `process.env` values may be undefined; a child process environment may not. */
function stringEnv(env: Record<string, string | undefined>): Record<string, string> {
	return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
