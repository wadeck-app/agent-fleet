import type { HostTool } from 'flow-engine';
import { HostToolCallChecker } from 'flow-engine';

import type { HostToolAuditEntry, HostToolAuditLog, HostToolCallOutcome } from './HostToolAuditLog';
import type { HostToolCallHandler, HostToolCallReply, HostToolCallRequest } from './HostToolCallTypes';
import type { ResolvedHostExecutable } from './HostToolExecutableResolver';
import type { HostToolExecutor } from './HostToolExecutor';
import { HostToolLimits } from './HostToolLimits';

export interface HostToolCallServiceOptions {
	stepId: string;
	tools: readonly HostTool[];
	/** One resolved executable per tool id, from run start. */
	executables: ReadonlyMap<string, ResolvedHostExecutable>;
	executor: Pick<HostToolExecutor, 'execute'>;
	audit: HostToolAuditLog;
	workspaceDir: string;
	/** Overrides `HostToolLimits.DEFAULTS.maxCallsPerStep` (tests use a small one). */
	maxCallsPerStep?: number;
}

/**
 * The host side of one step's tool calls (`HostToolCallHandler`): counts the call, checks the arguments against the schema
 * the tool declared (a refusal text goes back to the model), applies the limits, delegates to the executor and writes the
 * audit entry. Counters belong to the instance, so they end with the step (the McpServer lifetime).
 *
 * Limits, chosen for bounded and simple behaviour: a call beyond the per-step count is refused; a call beyond the
 * tool's concurrency (default 2 running at once, per tool) is refused at once with a "busy, retry" text instead of
 * queued, because the per-call timer of the connection starts when the call arrives and a queue would spend it waiting.
 * Refused calls count towards the per-step total: a flood of bad calls is still a flood.
 */
export class HostToolCallService implements HostToolCallHandler {
	private readonly toolsById = new Map<string, HostTool>();
	private readonly running = new Map<string, number>();
	private readonly maxCalls: number;
	private calls = 0;

	constructor(private readonly options: HostToolCallServiceOptions) {
		for (const tool of options.tools) {
			if (!options.executables.has(tool.id)) {
				throw new Error(
					`Step '${options.stepId}' tool '${tool.id}': no resolved executable. Fix: resolve the executables of every tool before serving the step.`
				);
			}
			this.toolsById.set(tool.id, tool);
		}
		this.maxCalls = options.maxCallsPerStep ?? HostToolLimits.DEFAULTS.maxCallsPerStep;
	}

	/** `signal` omitted: the call is never aborted (direct callers and tests). The connection always passes one. */
	async call(request: HostToolCallRequest, signal?: AbortSignal): Promise<HostToolCallReply> {
		const started = Date.now();
		this.calls += 1;
		const tool = this.toolsById.get(request.toolId);
		if (this.calls > this.maxCalls) {
			return this.deny(
				request,
				tool,
				started,
				this.toolLabel(
					request.toolId,
					`this step reached its limit of ${this.maxCalls} calls per step. Continue without this tool`
				)
			);
		}
		if (tool === undefined) {
			const declared = [...this.toolsById.keys()].join(', ');
			return this.deny(
				request,
				tool,
				started,
				this.toolLabel(request.toolId, `the tool is not declared for this step. Declared tools: ${declared}`)
			);
		}
		const check = HostToolCallChecker.check(tool, request.args);
		if (!check.ok) {
			return this.deny(request, tool, started, check.message);
		}
		const limits = HostToolLimits.resolve(tool);
		const running = this.running.get(tool.id) ?? 0;
		if (running >= limits.concurrency) {
			return this.deny(
				request,
				tool,
				started,
				this.toolLabel(
					tool.id,
					`${limits.concurrency} calls of this tool are already running (limit ${limits.concurrency}). Retry when one has finished`
				)
			);
		}
		this.running.set(tool.id, running + 1);
		try {
			const result = await this.options.executor.execute({
				stepId: this.options.stepId,
				tool,
				executable: this.options.executables.get(tool.id)!,
				values: check.values,
				limits,
				workspaceDir: this.options.workspaceDir,
				...(signal === undefined ? {} : { signal }),
			});
			const reply = result.reply;
			const reason = result.aborted === true ? `aborted: ${String(signal?.reason)}` : result.problem;
			this.options.audit.record({
				...this.baseEntry(request, tool, true),
				outcome: result.aborted === true ? 'aborted' : HostToolCallService.outcomeOf(reply, result.problem),
				...(reason === undefined ? {} : { reason }),
				exitCode: reply.exitCode,
				durationMs: result.durationMs,
				outputBytes: Buffer.byteLength(reply.text, 'utf8'),
				truncated: reply.truncated,
				timedOut: reply.timedOut === true,
				envDenied: result.envDenied,
				envMissing: result.envMissing,
			});
			return reply;
		} catch (error) {
			// An executor bug must not leave the model without an answer, nor hide behind a stack trace.
			const message = error instanceof Error ? error.message : String(error);
			const text = `Tool '${tool.id}' was not run: internal error in the host tool runner: ${message}`;
			this.options.audit.record({
				...this.baseEntry(request, tool, true),
				outcome: 'error',
				reason: message,
				exitCode: null,
				durationMs: Date.now() - started,
				outputBytes: Buffer.byteLength(text, 'utf8'),
				truncated: false,
				timedOut: false,
				envDenied: [],
				envMissing: [],
			});
			return { ok: false, text, truncated: false, exitCode: null };
		} finally {
			this.running.set(tool.id, (this.running.get(tool.id) ?? 1) - 1);
		}
	}

	private toolLabel(toolId: string, problem: string): string {
		return `Tool '${toolId}' was not run: ${problem}.`;
	}

	/** A refused call: nothing ran, the model is told why, the audit line carries the reason and never a value. */
	private deny(
		request: HostToolCallRequest,
		tool: HostTool | undefined,
		started: number,
		text: string
	): HostToolCallReply {
		this.options.audit.record({
			...this.baseEntry(request, tool, false),
			outcome: 'denied',
			reason: text,
			exitCode: null,
			durationMs: Date.now() - started,
			outputBytes: Buffer.byteLength(text, 'utf8'),
			truncated: false,
			timedOut: false,
			envDenied: [],
			envMissing: [],
		});
		return { ok: false, text, truncated: false, exitCode: null };
	}

	private baseEntry(
		request: HostToolCallRequest,
		tool: HostTool | undefined,
		validated: boolean
	): Pick<HostToolAuditEntry, 'tool' | 'toolId' | 'callId' | 'rawArgs' | 'validated'> {
		return { tool, toolId: request.toolId, callId: request.callId, rawArgs: request.args, validated };
	}

	private static outcomeOf(reply: HostToolCallReply, problem: string | undefined): HostToolCallOutcome {
		if (problem !== undefined) return 'error';
		if (reply.timedOut === true) return 'timed_out';
		return reply.ok ? 'ok' : 'failed';
	}
}
