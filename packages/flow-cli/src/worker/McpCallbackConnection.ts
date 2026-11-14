import * as crypto from 'node:crypto';
import type * as net from 'node:net';

import type { InjectedStep } from '../ipc/Protocol';
import type { DeclaredHostTool, HostToolCallReply, McpCallToolConfig } from './HostToolCallTypes';
import { HOST_TOOL_ABORT_REASONS, HOST_TOOL_PROTOCOL_VERSION } from './HostToolCallTypes';

/** Largest accepted line, and therefore the largest amount of unterminated data kept in memory per connection. */
export const MAX_CALLBACK_LINE_BYTES = 2 * 1024 * 1024;

/** A connection that sends nothing for this long is closed. */
export const DEFAULT_CALLBACK_IDLE_TIMEOUT_MS = 30_000;

/** Longest accepted `callId`: it is echoed in the reply and in diagnostics. */
const MAX_CALL_ID_LENGTH = 128;

export interface McpCallbackConnectionConfig {
	/** Secret the peer must present to inject steps (v1); valid for nothing else. Never logged. */
	token: string;
	executionId: string;
	onInjectSteps: (steps: InjectedStep[]) => Promise<void>;
	idleTimeoutMs: number;
	/** Receives fixed-text diagnostics only: never a token nor any payload content. */
	log: (message: string) => void;
	/** True once the owning server stopped: both tokens are dead from then on. */
	isRevoked?: () => boolean;
	/** Aborts when the owning server stops: the call in flight is aborted and the socket destroyed. */
	stopSignal?: AbortSignal;
	/** Present only when the step declares host tools; without it no `call_tool` line can be authorised. */
	callTool?: McpCallToolConfig;
}

/** Constant-time string comparison; a length mismatch is a plain `false`, never a throw. */
function safeEqual(received: string, expected: string): boolean {
	const receivedBytes = Buffer.from(received, 'utf8');
	const expectedBytes = Buffer.from(expected, 'utf8');
	if (receivedBytes.length !== expectedBytes.length) return false;
	return crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInjectedStepList(value: unknown): value is InjectedStep[] {
	return Array.isArray(value) && value.every(item => isPlainObject(item) && typeof item['id'] === 'string');
}

function errorReply(text: string): HostToolCallReply {
	return { ok: false, text, truncated: false, exitCode: null };
}

/** A validated `call_tool` line (the bearer and the execution id are checked, the arguments are not). */
interface CallToolLine {
	callId: string;
	toolId: string;
	args: Record<string, unknown>;
}

type CallState = 'none' | 'inFlight' | 'done';

/**
 * One TCP connection from the MCP helper (mcp-server.cjs): newline-delimited JSON lines.
 *
 * - v1 (legacy, no `v`/`kind`): `{ token, executionId, steps }`, no reply.
 * - v2 `{ v: 2, kind: 'call_tool', token, executionId, callId, toolId, args }`: one call per connection, answered by one
 *   line `{ v: 2, callId, ok, text, truncated, exitCode, timedOut? }`, after which the host ends the socket.
 *
 * Any local process can connect to the loopback port, so every byte is untrusted until the token
 * matches. A protocol violation (malformed JSON, wrong shape, bad token or executionId, a token presented for the wrong
 * kind, oversize line, idle peer, any line while a call is in flight) destroys the connection rather than skipping the
 * line: the legitimate helper never sends such input, so tolerating it only helps an attacker probe. An unknown `kind` or
 * `v` is rejected too, with a v2 error line first when the peer spoke v2. Nothing thrown while handling data may escape
 * as an uncaught exception, since the worker exits on one.
 *
 * While a call is in flight the idle timer is replaced by a per-call timer (`timeoutSeconds` + grace): when it fires the
 * host answers `timedOut` itself. The idle timer comes back after the reply.
 */
export class McpCallbackConnection {
	private buffer = '';
	private closed = false;
	private callState: CallState = 'none';
	/** The tool and call id of the call in flight (null / '' otherwise). */
	private pendingTool: DeclaredHostTool | null = null;
	private pendingCallId = '';
	/** Aborted when the server stops or the socket closes while the call is in flight. */
	private pendingAbort: AbortController | null = null;
	private readonly onStop = (): void => this.abortAndDestroy(HOST_TOOL_ABORT_REASONS.stepEnded);

	constructor(
		private readonly socket: net.Socket,
		private readonly config: McpCallbackConnectionConfig
	) {
		socket.setTimeout(config.idleTimeoutMs);
		socket.on('timeout', () => this.handleTimeout());
		socket.on('data', chunk => this.handleData(chunk));
		socket.on('error', err => {
			this.config.log(`TCP socket error: ${err.message}`);
		});
		socket.on('close', () => {
			this.closed = true;
			config.stopSignal?.removeEventListener('abort', this.onStop);
			this.abortCall(HOST_TOOL_ABORT_REASONS.connectionClosed);
		});
		if (config.stopSignal?.aborted === true) {
			this.onStop();
		} else config.stopSignal?.addEventListener('abort', this.onStop, { once: true });
	}

	/** The server stopped: the call in flight (if any) is aborted FIRST, so its process tree is ended before the socket goes. */
	private abortAndDestroy(reason: string): void {
		this.abortCall(reason);
		this.closed = true;
		this.socket.destroy();
	}

	/** Tells the handler of the call in flight to stop; its late result is dropped (the call counts as answered). */
	private abortCall(reason: string): void {
		if (this.callState !== 'inFlight') {
			return;
		}
		this.callState = 'done';
		this.pendingTool = null;
		this.pendingAbort?.abort(reason);
		this.pendingAbort = null;
	}

	private handleTimeout(): void {
		if (this.callState === 'inFlight' && this.pendingTool !== null) {
			this.config.log('TCP: call_tool timed out');
			const tool = this.pendingTool;
			this.finishCall(
				{
					...errorReply(
						`Host tool '${tool.id}' did not finish in time (limit ${tool.timeoutSeconds} s). Fix: call it again with narrower arguments, or ask for a higher timeoutSeconds in the step definition.`
					),
					timedOut: true,
				},
				null
			);
			return;
		}
		this.reject('idle timeout');
	}

	private handleData(chunk: Buffer): void {
		if (this.closed) return;
		try {
			this.buffer += chunk.toString('utf8');
			let newline: number;
			while (!this.closed && (newline = this.buffer.indexOf('\n')) !== -1) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				if (line.length > MAX_CALLBACK_LINE_BYTES) {
					this.reject('line too long');
					return;
				}
				if (!line.trim()) continue;
				this.handleLine(line);
			}
			if (!this.closed && this.buffer.length > MAX_CALLBACK_LINE_BYTES) {
				this.reject('line too long');
			}
		} catch {
			// Deliberately no error message: it could quote payload content.
			this.reject('internal error while handling data');
		}
	}

	private handleLine(line: string): void {
		if (this.callState !== 'none') {
			this.reject('line received after a call_tool request');
			return;
		}
		if (this.config.isRevoked?.() === true) {
			this.reject('server stopped');
			return;
		}
		let payload: unknown;
		try {
			payload = JSON.parse(line);
		} catch {
			this.reject('invalid JSON');
			return;
		}
		if (!isPlainObject(payload)) {
			this.reject('unexpected payload shape');
			return;
		}
		if ('v' in payload || 'kind' in payload) {
			this.handleV2(payload);
		} else {
			this.handleInject(payload);
		}
	}

	private handleInject(payload: Record<string, unknown>): void {
		if (
			typeof payload['token'] !== 'string' ||
			typeof payload['executionId'] !== 'string' ||
			!isInjectedStepList(payload['steps'])
		) {
			this.reject('unexpected payload shape');
			return;
		}
		if (!this.authenticate(payload['token'], 'inject')) {
			return;
		}
		if (!safeEqual(payload['executionId'], this.config.executionId)) {
			this.reject('executionId mismatch');
			return;
		}
		const steps = payload['steps'];
		Promise.resolve(this.config.onInjectSteps(steps)).catch(err => {
			this.config.log(`onInjectSteps error: ${String(err)}`);
		});
	}

	private handleV2(payload: Record<string, unknown>): void {
		if (payload['v'] !== HOST_TOOL_PROTOCOL_VERSION || payload['kind'] !== 'call_tool') {
			this.rejectUnknownMessage(payload['v'] === HOST_TOOL_PROTOCOL_VERSION);
			return;
		}
		const { token, executionId, callId, toolId, args } = payload;
		if (
			typeof token !== 'string' ||
			typeof executionId !== 'string' ||
			typeof callId !== 'string' ||
			callId.length === 0 ||
			callId.length > MAX_CALL_ID_LENGTH ||
			typeof toolId !== 'string' ||
			!isPlainObject(args)
		) {
			this.reject('unexpected payload shape');
			return;
		}
		if (!this.authenticate(token, 'call_tool')) {
			return;
		}
		if (!safeEqual(executionId, this.config.executionId)) {
			this.reject('executionId mismatch');
			return;
		}
		this.startCall({ callId, toolId, args });
	}

	/** Checks the bearer for the kind of the line; rejects (and returns false) on the wrong bearer. Never logs the token. */
	private authenticate(token: string, kind: 'inject' | 'call_tool'): boolean {
		// Both comparisons always run: the time taken does not tell which bearer was close.
		const isInjectToken = safeEqual(token, this.config.token);
		const toolToken = this.config.callTool?.toolToken;
		const isToolToken = toolToken !== undefined && safeEqual(token, toolToken);
		if (kind === 'inject' && isInjectToken) {
			return true;
		}
		if (kind === 'call_tool' && isToolToken) {
			return true;
		}
		this.reject(isInjectToken || isToolToken ? `token not valid for ${kind}` : 'invalid token');
		return false;
	}

	private startCall(line: CallToolLine): void {
		const callTool = this.config.callTool;
		if (callTool === undefined) {
			// authenticate() cannot succeed without a tool bearer; kept as the explicit fail-fast.
			this.reject('call_tool without declared tools');
			return;
		}
		const tool = callTool.declared.find(candidate => candidate.id === line.toolId);
		if (tool === undefined) {
			this.callState = 'done';
			this.config.log('TCP: call_tool refused -- tool not declared');
			this.replyAndEnd(
				line.callId,
				errorReply(
					`Host tool '${line.toolId}' is not declared for this step. Allowed tools: ${callTool.declared.map(candidate => candidate.id).join(', ')}.`
				)
			);
			return;
		}
		this.callState = 'inFlight';
		this.pendingTool = tool;
		this.pendingCallId = line.callId;
		const abort = new AbortController();
		this.pendingAbort = abort;
		this.socket.setTimeout(tool.timeoutSeconds * 1000 + callTool.graceMs);
		new Promise<HostToolCallReply>(resolve => {
			resolve(
				callTool.handler.call(
					{
						executionId: this.config.executionId,
						callId: line.callId,
						toolId: line.toolId,
						args: line.args,
					},
					abort.signal
				)
			);
		}).then(
			reply => this.finishCall(reply, tool),
			() => {
				// Fixed text on purpose: the error could quote arguments or output.
				this.config.log('TCP: host tool handler failed');
				this.finishCall(
					errorReply(
						`Host tool '${tool.id}' failed inside the flow host. Fix: see the flow worker log of this run.`
					),
					null
				);
			}
		);
	}

	/**
	 * Answers the call in flight once; a late result after a timeout or a close is dropped.
	 * `tool` is the tool whose output cap applies to a handler reply; null for a reply the host wrote itself.
	 */
	private finishCall(reply: HostToolCallReply, tool: DeclaredHostTool | null): void {
		if (this.callState !== 'inFlight') {
			return;
		}
		this.callState = 'done';
		this.pendingTool = null;
		this.pendingAbort = null;
		this.socket.setTimeout(this.config.idleTimeoutMs);
		if (this.closed) {
			return;
		}
		this.replyAndEnd(this.pendingCallId, tool === null ? reply : this.capReply(reply, tool));
	}

	/** Refuses a reply over the tool's output cap, or whose JSON line would not fit the callback line cap. */
	private capReply(reply: HostToolCallReply, tool: DeclaredHostTool): HostToolCallReply {
		if (Buffer.byteLength(reply.text, 'utf8') > tool.maxOutputBytes) {
			this.config.log('TCP: call_tool reply refused -- over maxOutputBytes');
			return errorReply(
				`Host tool '${tool.id}' produced more than its maxOutputBytes (${tool.maxOutputBytes}); the output was dropped. Fix: narrow the call, or raise maxOutputBytes in the step definition.`
			);
		}
		if (this.serialize(this.pendingCallId, reply).length > MAX_CALLBACK_LINE_BYTES) {
			this.config.log('TCP: call_tool reply refused -- over the line cap');
			return errorReply(
				`Host tool '${tool.id}' produced output too large for the callback line cap once encoded; the output was dropped. Fix: narrow the call.`
			);
		}
		return reply;
	}

	private serialize(callId: string, reply: HostToolCallReply): string {
		return (
			JSON.stringify({
				v: HOST_TOOL_PROTOCOL_VERSION,
				callId,
				ok: reply.ok,
				text: reply.text,
				truncated: reply.truncated,
				exitCode: reply.exitCode,
				...(reply.timedOut === true ? { timedOut: true } : {}),
			}) + '\n'
		);
	}

	private replyAndEnd(callId: string, reply: HostToolCallReply): void {
		if (this.closed) {
			return;
		}
		this.socket.write(this.serialize(callId, reply));
		this.socket.setTimeout(this.config.idleTimeoutMs);
		this.socket.end();
	}

	/** Unknown `kind`/`v`: loud, and a v2 peer gets a v2 error line first (it can show it to the model). */
	private rejectUnknownMessage(peerSpokeV2: boolean): void {
		if (!peerSpokeV2) {
			this.reject('unsupported protocol message');
			return;
		}
		this.config.log("TCP: connection rejected -- unsupported kind (this host serves v 2 kind 'call_tool')");
		this.callState = 'done';
		this.replyAndEnd(
			'',
			errorReply("Unsupported callback message. This host understands v 2 with kind 'call_tool'.")
		);
		this.closed = true;
	}

	private reject(reason: string): void {
		if (this.closed) return;
		this.closed = true;
		this.config.log(`TCP: connection rejected -- ${reason}`);
		this.socket.destroy();
	}
}
