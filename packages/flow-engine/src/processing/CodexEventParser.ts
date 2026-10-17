/**
 * CodexEventParser -- turns the JSONL stream of `codex exec --json` into StreamJsonEvents.
 *
 * Event schema verified against codex-cli 0.163.0 (codex-mock.mjs and
 * StepRunner.codex.integration.test.ts compare it field by field with the real CLI):
 *
 *   thread.started { thread_id }
 *   turn.started | turn.completed { usage } | turn.failed { error: { message } }
 *   item.started | item.completed { item } with item.type one of
 *     agent_message { text }
 *     command_execution { command, aggregated_output, exit_code, status }
 *     mcp_tool_call { server, tool, arguments, result: { content[] } | null, error: { message } | null, status }
 *     file_change { changes: [{ path, kind }], status }          (apply_patch)
 *     error { message }                                          (non-fatal diagnostics; codex still exits 0)
 *   error { message }                                            (intermediate, e.g. "Reconnecting... 1/5")
 *
 * Real codex reports no cost, so cost stays 0. Other item types that exist in codex but were not
 * captured (reasoning, web_search, todo_list, ...) are reported once as "unrecognized" rather than
 * guessed at.
 */
import type { StreamJsonEvent, StreamJsonEventCallback } from './StreamJsonParser';

/**
 * Narrow an unknown JSON value to a plain object.
 * Arrays and null are rejected -- they never carry the keys we read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

export class CodexEventParser {
	private lineBuffer = '';
	private sessionId = '';
	private initFired = false;
	private responseText = '';
	private inputTokens = 0;
	private outputTokens = 0;
	private readonly failureMessages: string[] = [];
	private readonly warnedUnknown = new Set<string>();

	constructor(
		private readonly model: string | undefined,
		private readonly onStreamEvent: StreamJsonEventCallback | undefined
	) {}

	/** Feed a raw stdout chunk; complete lines are parsed, the remainder is buffered. */
	public feed(chunk: string): void {
		this.lineBuffer += chunk;
		let newlineIdx: number;
		while ((newlineIdx = this.lineBuffer.indexOf('\n')) !== -1) {
			const line = this.lineBuffer.substring(0, newlineIdx).trim();
			this.lineBuffer = this.lineBuffer.substring(newlineIdx + 1);
			if (line) {
				this.processLine(line);
			}
		}
	}

	/** Parse whatever is left in the buffer (a final line without a trailing newline). */
	public flush(): void {
		const remaining = this.lineBuffer.trim();
		if (remaining) {
			this.processLine(remaining);
		}
		this.lineBuffer = '';
	}

	/** Emit the final `result` event. A no-op when the stream never produced a thread id. */
	public emitResult(durationMs: number): void {
		if (!this.onStreamEvent || !this.initFired) return;
		this.onStreamEvent({
			type: 'result',
			subtype: 'result',
			data: {
				result: this.responseText,
				// codex reports no cost
				cost_usd: 0,
				duration_ms: durationMs,
				modelUsage: { codex: { inputTokens: this.inputTokens, outputTokens: this.outputTokens } },
			},
		});
	}

	/**
	 * Real codex writes the failure reason only to the JSONL stream (stderr stays empty), so the
	 * caller appends this to stderr, where callers look for an actionable error.
	 */
	public failureSummary(): string {
		return this.failureMessages.map(m => `codex: ${m}`).join('\n');
	}

	private warnUnknown(kind: string): void {
		if (this.warnedUnknown.has(kind)) return;
		this.warnedUnknown.add(kind);
		console.warn(
			`[CodexModelProvider] unrecognized codex event "${kind}" ignored -- the codex JSONL schema may have changed; run StepRunner.codex.integration.test with CODEX_INTEGRATION=1`
		);
	}

	private processLine(line: string): void {
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch {
			return;
		}
		// Non-object JSON lines (arrays, numbers, strings) carry none of the event keys we read
		if (!isRecord(raw)) {
			return;
		}
		const eventType = raw['type'];

		switch (eventType) {
			case 'thread.started': {
				const threadId = raw['thread_id'];
				if (typeof threadId === 'string' && threadId && !this.sessionId) {
					this.sessionId = threadId;
				}
				if (!this.initFired) {
					this.initFired = true;
					const initEvent: StreamJsonEvent = {
						type: 'system',
						subtype: 'init',
						data: { session_id: this.sessionId, model: this.model ?? 'codex' },
					};
					this.onStreamEvent?.(initEvent);
				}
				break;
			}
			case 'turn.started':
			case 'item.started':
				// item.started carries no information item.completed does not repeat.
				break;
			case 'item.completed':
				this.processCompletedItem(isRecord(raw['item']) ? raw['item'] : undefined);
				break;
			case 'turn.completed': {
				const usage = isRecord(raw['usage']) ? raw['usage'] : undefined;
				this.inputTokens += typeof usage?.['input_tokens'] === 'number' ? usage['input_tokens'] : 0;
				this.outputTokens += typeof usage?.['output_tokens'] === 'number' ? usage['output_tokens'] : 0;
				break;
			}
			case 'error':
				// Intermediate (e.g. "Reconnecting... 1/5"); the terminal outcome is turn.failed.
				break;
			case 'turn.failed': {
				const error = isRecord(raw['error']) ? raw['error'] : undefined;
				this.failureMessages.push(asString(error?.['message'], 'codex turn failed (no message)'));
				break;
			}
			default:
				this.warnUnknown(String(eventType));
		}
	}

	private processCompletedItem(item: Record<string, unknown> | undefined): void {
		const itemType = item?.['type'];
		switch (itemType) {
			case 'agent_message': {
				const text = item?.['text'];
				if (typeof text === 'string' && text) {
					this.responseText += text;
					this.onStreamEvent?.({ type: 'text', subtype: 'text', data: { text } });
				}
				break;
			}
			case 'command_execution':
				this.emitToolUse({
					tool: 'command_execution',
					callID: asString(item?.['id']),
					input: { command: item?.['command'] },
					output: asString(item?.['aggregated_output']),
					status: asString(item?.['status']),
				});
				break;
			case 'mcp_tool_call':
				this.emitToolUse({
					// Same name codex's own hooks use for MCP tools (mcp__<server>__<tool>)
					tool: `mcp__${asString(item?.['server'], 'unknown')}__${asString(item?.['tool'], 'unknown')}`,
					callID: asString(item?.['id']),
					input: isRecord(item?.['arguments']) ? item['arguments'] : {},
					output: this.mcpOutput(item),
					status: asString(item?.['status']),
				});
				break;
			case 'file_change': {
				const changes = Array.isArray(item?.['changes']) ? item['changes'] : [];
				this.emitToolUse({
					tool: 'apply_patch',
					callID: asString(item?.['id']),
					input: { changes },
					output: changes
						.filter(isRecord)
						.map(change => `${asString(change['kind'], '?')} ${asString(change['path'], '?')}`)
						.join('\n'),
					status: asString(item?.['status']),
				});
				break;
			}
			case 'error': {
				// Non-fatal diagnostics (e.g. ignored config settings): codex still exits 0.
				console.warn(`[CodexModelProvider] codex reported: ${asString(item?.['message'], '(no message)')}`);
				break;
			}
			default:
				this.warnUnknown(`item.completed/${String(itemType)}`);
		}
	}

	/** Text parts of the MCP result, or the error message when the call failed before producing one. */
	private mcpOutput(item: Record<string, unknown> | undefined): string {
		const result = isRecord(item?.['result']) ? item['result'] : undefined;
		const content = Array.isArray(result?.['content']) ? result['content'] : [];
		const text = content
			.filter(isRecord)
			.map(part => asString(part['text']))
			.filter(Boolean)
			.join('\n');
		if (text) return text;
		const error = isRecord(item?.['error']) ? item['error'] : undefined;
		return error ? `error: ${asString(error['message'], '(no message)')}` : '';
	}

	private emitToolUse(data: Record<string, unknown>): void {
		this.onStreamEvent?.({ type: 'tool_use', subtype: 'tool_use', data });
	}
}
