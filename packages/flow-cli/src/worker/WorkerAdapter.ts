import type { StepRunner } from 'flow-engine';
import type { TemplateContext } from 'flow-engine/processing/TemplateRenderer';
import type { ToolCallInFlight, ToolProgress } from 'flow-engine/processing/ToolCallTracker';
import type { LiveLogEntry, ModelFlowStep, ScriptFlowStep, Workspace } from 'flow-engine/types';
import { randomUUID } from 'node:crypto';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type {
	AssignableStep,
	AssignmentScopedMessage,
	ExecutionContext,
	InjectedStep,
	StepIoCapture,
	StepToolActivity,
} from '../ipc/Protocol';
import { TOOL_ACTIVITY_SUMMARY_MAX_LENGTH } from '../ipc/Protocol';
import { SecretMasker } from '../secrets/SecretMasker';
import type { McpServerConfig } from './McpServer';
import { McpServer } from './McpServer';
import { buildStepIoCapture } from './StepIoCaptureBuilder';

/**
 * Sends a message about the step being executed. Already bound to the current
 * assignment by the caller, so nothing here handles assignment ids.
 */
export type SendMessageFn = (msg: AssignmentScopedMessage) => void;

// Factory that creates a StepRunner configured with the given MCP servers.
// Pass an empty array when no MCP server is needed (script steps).
export type StepRunnerFactory = (mcpServers: McpServerConfig[]) => StepRunner;

// Kept as a code point so the source stays ASCII; the displayed text is unchanged.
const ELLIPSIS = String.fromCharCode(0x2026);

/**
 * What the daemon is told about a tool call in flight.
 *
 * Masked BEFORE being cut to length: cutting first could split a secret so the masker no longer
 * recognises it and its leading characters would be sent.
 */
function toStepToolActivity(activity: ToolCallInFlight | null, masker: SecretMasker): StepToolActivity | null {
	if (activity === null) {
		return null;
	}
	const summary = masker.mask(activity.summary);
	return {
		tool: masker.mask(activity.tool),
		summary:
			summary.length <= TOOL_ACTIVITY_SUMMARY_MAX_LENGTH
				? summary
				: summary.slice(0, TOOL_ACTIVITY_SUMMARY_MAX_LENGTH - 1) + ELLIPSIS,
		startedAt: activity.startedAt,
	};
}

function sendStdoutAsLogs(
	stdout: string | undefined,
	executionId: string,
	stepId: string,
	sendMessage: SendMessageFn
): void {
	if (!stdout?.trim()) {
		return;
	}
	for (const line of stdout.split('\n')) {
		if (!line.trim()) {
			continue;
		}
		const entry: LiveLogEntry = {
			id: randomUUID(),
			timestamp: Date.now(),
			level: 'info',
			message: line,
			eventType: 'result',
		};
		sendMessage({ type: 'log', executionId, stepId, entry });
	}
}

function maskOptional(masker: SecretMasker, text: string | undefined): string | undefined {
	return text === undefined ? undefined : masker.mask(text);
}

// The error is rethrown with the same extra fields (stdout, stderr, stepOutputs, io) the caller
// forwards to the daemon, all masked.
function maskError(error: unknown, masker: SecretMasker): unknown {
	if (!(error instanceof Error)) {
		return error;
	}
	const carried = error as Error & {
		stdout?: string;
		stderr?: string;
		stepOutputs?: Record<string, unknown>;
		io?: StepIoCapture;
	};
	return Object.assign(new Error(masker.mask(normalizeError(error).message)), {
		stdout: maskOptional(masker, carried.stdout),
		stderr: maskOptional(masker, carried.stderr),
		stepOutputs: masker.maskDeep(carried.stepOutputs),
		io: masker.maskDeep(carried.io),
	});
}

export interface StepResult {
	output: Record<string, unknown>;
	meta?: import('flow-engine/types').StepMeta;
	/** What the step received and printed, for the daemon to record. */
	io: StepIoCapture;
}

export class WorkerAdapter {
	private readonly stepRunnerFactory: StepRunnerFactory;

	constructor(stepRunnerFactory: StepRunnerFactory) {
		this.stepRunnerFactory = stepRunnerFactory;
	}

	/**
	 * Runs one step. Everything that leaves this method (messages, result, error) has had the
	 * exact values of the step's secrets replaced; the unmasked text never leaves the worker.
	 */
	async execute(step: AssignableStep, context: ExecutionContext, sendMessage: SendMessageFn): Promise<StepResult> {
		const masker = new SecretMasker(new Map(Object.entries(context.secrets ?? {})));
		try {
			const result = await this.run(step, context, message => sendMessage(masker.maskDeep(message)), masker);
			return masker.maskDeep(result);
		} catch (error) {
			throw maskError(error, masker);
		}
	}

	private async run(
		step: AssignableStep,
		context: ExecutionContext,
		sendMessage: SendMessageFn,
		masker: SecretMasker
	): Promise<StepResult> {
		if ((step as { type: string }).type === 'subflow') {
			throw new Error(`Step type 'subflow' is not supported in v1`);
		}

		// Build a minimal Workspace for flow-engine's StepRunner
		const workspace: Workspace = {
			id: `ws-${context.executionId}`,
			path: context.workspaceDir,
			metaDir: context.outputsDir
				? context.outputsDir.replace(/[/\\]outputs$/, '')
				: context.workspaceDir + '.meta',
			mode: 'manual',
			concurrency: { key: context.executionId, activeTasks: new Set<string>(), locked: false },
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		// Build TemplateContext for flow-engine
		// stepOutputs is a Map in TemplateContext (not a plain object)
		const templateContext: TemplateContext = {
			// Identifies the run to anything that has to address it from outside, above all an
			// approval request: without it every request was published as "unknown_<stepId>", so two
			// concurrent flows shared one filename and an answer could satisfy the wrong step.
			taskId: context.executionId,
			// The secrets this step uses are plain inputs for ${{ inputs.NAME }}; the separate map is
			// what the engine injects as environment variables for `secrets:`.
			inputs: { ...context.inputs, ...context.secrets },
			...(context.secrets ? { secrets: context.secrets } : {}),
			stepOutputs: new Map(Object.entries(context.stepOutputs)),
			stepMeta: new Map(Object.entries(context.stepMeta)) as unknown as Map<string, Record<string, unknown>>,
			taskMetadata: {},
			context: {
				cwd: context.cwd,
				projectDir: context.cwd,
				workspaceDir: context.workspaceDir,
				outputsDir: context.outputsDir,
				...(context.flowWorkingDir ? { workingDir: context.flowWorkingDir } : {}),
				// Sub-step re-run error context: parent model step can reference these in its prompt
				// via ${{ context.lastSubStepError }} or ${{ context.subStepErrors }}
				lastSubStepError: (context.subStepErrors?.[step.id] ?? []).at(-1) ?? '',
				subStepErrors: JSON.stringify(context.subStepErrors?.[step.id] ?? []),
			},
			// Sub-step outputs for ${{ subSteps.stepId.outputs.* }} and {% if subSteps.stepId.status.failed %}
			subSteps: context.subSteps ? new Map(Object.entries(context.subSteps)) : undefined,
			// Every failed sub-step's own feedback, pre-aggregated for ${{ subStepFeedback }}
			subStepFeedback: context.subStepFeedback,
			// Set only when the daemon re-dispatched this parent because a sub-step failed: the model
			// step then resumes its previous session (stepMeta) with just this feedback
			...(context.subStepRelaunch ? { subStepRelaunch: context.subStepRelaunch } : {}),
		};

		// Keeps the daemon's stall watchdog informed regardless of log/toolLog display
		// settings (see Protocol.ts's 'step_progress' doc for why onLogEntry alone is not
		// enough). Throttled: the watchdog only needs "something happened recently", not
		// one message per stream chunk.
		const PROGRESS_THROTTLE_MS = 5000;
		let lastProgressSentAt = 0;
		const onActivity = (progress: ToolProgress): void => {
			const now = Date.now();
			// A tool call starting or returning is rare and is what a stall report later
			// names, so unlike a plain heartbeat it is never held back by the throttle.
			if (!progress.changed && now - lastProgressSentAt < PROGRESS_THROTTLE_MS) {
				return;
			}
			lastProgressSentAt = now;
			sendMessage({
				type: 'step_progress',
				executionId: context.executionId,
				stepId: step.id,
				// A heartbeat leaves out `activity`, which tells the daemon to keep what it knows.
				...(progress.changed && { activity: toStepToolActivity(progress.activity, masker) }),
				// null tells the daemon a follow-up turn cleared the final result it was told about.
				...(progress.changed && { finalResultAt: progress.finalResultAt ?? null }),
				...(progress.lastCompletedTool !== undefined && {
					lastCompletedTool: progress.lastCompletedTool,
				}),
			});
		};

		// For model steps, wire up the MCP server for provideSteps injection
		if (step.type === 'model') {
			const onInjectSteps = async (steps: InjectedStep[]): Promise<void> => {
				sendMessage({ type: 'inject_steps', executionId: context.executionId, steps });
			};

			const mcpServer = new McpServer(context.executionId, onInjectSteps);
			const { mcpServer: mcpServerConfig } = await mcpServer.start();

			// Create a runner with MCP servers baked into the factory call
			const runner = this.stepRunnerFactory([mcpServerConfig]);

			// Log the rendered prompt to the daemon execution log before launching the model.
			// This appears in `flow cli logs -f` and is invaluable for debugging prompt issues.
			runner.setOnRenderedPrompt((prompt: string) => {
				const entry: LiveLogEntry = {
					id: randomUUID(),
					timestamp: Date.now(),
					level: 'debug',
					message: `[rendered prompt]\n${prompt}`,
					eventType: 'system',
				};
				sendMessage({ type: 'log', executionId: context.executionId, stepId: step.id, entry });
			});

			try {
				// Notify user that the model step has started (before Claude CLI launches)
				sendMessage({
					type: 'log',
					executionId: context.executionId,
					stepId: step.id,
					entry: {
						id: randomUUID(),
						timestamp: Date.now(),
						level: 'info',
						message: `Launching ${(step as unknown as { model?: string }).model ?? 'model'}${ELLIPSIS}`,
						eventType: 'system',
					},
				});

				// Wire onLogEntry for streaming/polling log modes -- sends each entry to daemon in real-time
				const logMode = (step as unknown as { log?: string }).log ?? 'end';
				const toolLog = (step as unknown as { toolLog?: string }).toolLog ?? 'none';
				const onLogEntry =
					logMode === 'end' || logMode === 'none'
						? undefined
						: (entry: import('flow-engine/types').LiveLogEntry) => {
								if (entry.eventType === 'assistant_text') {
									sendMessage({
										type: 'log',
										executionId: context.executionId,
										stepId: step.id,
										entry,
									});
									return;
								}
								if (entry.eventType === 'tool_use' && (toolLog === 'name' || toolLog === 'full')) {
									const base = `-> ${entry.message}`;
									const displayEntry = {
										...entry,
										message:
											toolLog === 'name'
												? base.slice(0, 120) + (base.length > 120 ? ELLIPSIS : '')
												: base,
									};
									sendMessage({
										type: 'log',
										executionId: context.executionId,
										stepId: step.id,
										entry: displayEntry,
									});
									return;
								}
								if (entry.eventType === 'tool_result' && toolLog === 'full') {
									sendMessage({
										type: 'log',
										executionId: context.executionId,
										stepId: step.id,
										entry: { ...entry, message: `<- ${entry.message}` },
									});
								}
							};

				const trace = await runner.executeStep(
					step as unknown as ModelFlowStep,
					workspace,
					templateContext,
					undefined,
					onLogEntry,
					onActivity
				);
				// For log:end/none -- send response as logs after completion (existing behavior)
				if (logMode === 'end') {
					sendStdoutAsLogs(
						maskOptional(masker, (trace as unknown as { response?: string }).response),
						context.executionId,
						step.id,
						sendMessage
					);
				}
				const io = buildStepIoCapture(step, trace, context);
				if (trace.error) {
					throw Object.assign(new Error(trace.error), { io });
				}
				// trace.outputs is undefined for model steps that produce no structured output --
				// an empty map is the correct representation (no outputs to propagate to dependents).
				return { output: trace.outputs ?? {}, meta: trace.meta, io };
			} finally {
				// Suppress stop errors so they do not shadow the original executeStep error.
				try {
					await mcpServer.stop();
				} catch {
					/* ignore cleanup errors */
				}
			}
		}

		const runner = this.stepRunnerFactory([]);
		// A script that prints is alive: reported as a throttled heartbeat so the daemon's silence watchdog
		// does not fail a long, chatty script. A silent one still trips it.
		const trace = await runner.executeStep(
			step as unknown as ScriptFlowStep,
			workspace,
			templateContext,
			undefined,
			undefined,
			onActivity
		);
		// Masked as a whole BEFORE being split into lines: a multi-line secret is intact here.
		sendStdoutAsLogs(maskOptional(masker, trace.stdout), context.executionId, step.id, sendMessage);
		const io = buildStepIoCapture(step, trace, context);
		if (trace.error) {
			// Include captured outputs (stdout/stderr) in the error so the daemon can forward them
			// to the scheduler for ${{ subSteps.xxx.outputs.stderr }} in parent prompts.
			const err = Object.assign(new Error(trace.error), {
				stepOutputs: trace.outputs ?? {},
				stdout: trace.stdout,
				stderr: trace.stderr,
				io,
			});
			throw err;
		}
		// trace.outputs is undefined for script steps without captureOutput -- empty map is correct.
		return { output: trace.outputs ?? {}, meta: trace.meta, io };
	}
}
