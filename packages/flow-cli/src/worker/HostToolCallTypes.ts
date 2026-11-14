import type { HostTool } from 'flow-engine';

/** Callback protocol version carried by `call_tool` lines and their replies. */
export const HOST_TOOL_PROTOCOL_VERSION = 2;

/** Extra time the host gives a handler beyond the tool's `timeoutSeconds` before it answers `timedOut` itself. */
export const DEFAULT_CALL_GRACE_MS = 5_000;

/** A call the connection accepted: the id is declared, the bearer and the execution id are checked. Arguments are NOT validated yet. */
export interface HostToolCallRequest {
	executionId: string;
	callId: string;
	toolId: string;
	/** Untrusted: the handler validates it against the declared argument schema. */
	args: Record<string, unknown>;
}

/** The one line the host answers with, minus the envelope fields (`v`, `callId`) the connection adds. */
export interface HostToolCallReply {
	ok: boolean;
	/** Actionable text for the model. Its UTF-8 size must not exceed the tool's `maxOutputBytes`. */
	text: string;
	truncated: boolean;
	/** Null when the process did not exit normally (denied call, timeout, spawn failure). */
	exitCode: number | null;
	timedOut?: boolean;
}

/** Why a call in flight was aborted: carried as the `reason` of the AbortSignal and written in the audit line. */
export const HOST_TOOL_ABORT_REASONS = { stepEnded: 'step ended', connectionClosed: 'connection closed' } as const;

/** Runs a declared call. Step 3 implements it (argument check with HostToolCallChecker, then the runner). */
export interface HostToolCallHandler {
	/**
	 * `signal` aborts when the step ends or the connection of the call closes: the handler must then end the process
	 * tree it started and stop working. Its reply is not written anywhere after that.
	 */
	call(request: HostToolCallRequest, signal: AbortSignal): Promise<HostToolCallReply>;
}

/** What the connection needs to know about a declared tool. */
export interface DeclaredHostTool {
	id: string;
	timeoutSeconds: number;
	maxOutputBytes: number;
}

/** The host tools of one step, as handed to {@link McpServer}. */
export interface HostToolServing {
	/** For messages only. */
	stepId: string;
	tools: readonly HostTool[];
	handler: HostToolCallHandler;
}

/** The `call_tool` half of a callback connection. Present only when the step declares tools. */
export interface McpCallToolConfig {
	/** Second bearer, valid for `call_tool` only. Never logged. */
	toolToken: string;
	declared: readonly DeclaredHostTool[];
	handler: HostToolCallHandler;
	/** Added to the tool's `timeoutSeconds` for the per-call timer. */
	graceMs: number;
}
