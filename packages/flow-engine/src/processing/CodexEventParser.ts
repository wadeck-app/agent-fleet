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
 * Real codex reports no cost, so cost_usd stays 0 here and the caller must not read it as a measurement (the
 * executor estimates it from the usage with ModelPriceTable). Usage semantics, measured on codex-cli 0.171.0:
 *   - `usage` of a resumed run (`codex exec resume`) is CUMULATIVE for the thread, like a claude session: a later
 *     turn.completed REPLACES the earlier one (never added), so the result carries the latest cumulative figures;
 *   - `input_tokens` INCLUDES `cached_input_tokens` and `cache_write_input_tokens`. The result event reports
 *     `inputTokens` as the UNCACHED part (input - cached - cacheWrite), like claude and opencode do, plus
 *     `cacheReadTokens` / `cacheWriteTokens`;
 *   - `output_tokens` is assumed to include `reasoning_output_tokens` (unverified: reasoning was 0 in the captures).
 * Other item types that exist in codex but were not
 * captured (reasoning, web_search, todo_list, ...) are reported once as "unrecognized" rather than
 * guessed at.
 */
import { isRecord } from 'shared-common/utils/isRecord';

import type { StreamJsonEvent, StreamJsonEventCallback } from './StreamJsonParser';

function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

interface CodexUsage {
	inputTokens: number;
	cachedInputTokens: number;
	cacheWriteInputTokens: number;
	outputTokens: number;
	reasoningOutputTokens: number | undefined;
}

export class CodexEventParser {
	private lineBuffer = '';
	private sessionId = '';
	private initFired = false;
	private responseText = '';
	/** Usage of the latest turn.completed (cumulative for the thread); undefined while none usable was seen. */
	private usage: CodexUsage | undefined;
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
				// codex reports no cost: this 0 is a placeholder, not a measurement
				cost_usd: 0,
				duration_ms: durationMs,
				// Empty when no usable usage was seen: the figures are then unknown, not zero
				modelUsage: this.usage === undefined ? {} : { codex: this.usageForResult(this.usage) },
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

	private usageForResult(usage: CodexUsage): Record<string, unknown> {
		const uncached = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
		const reasoning =
			usage.reasoningOutputTokens === undefined ? {} : { reasoningTokens: usage.reasoningOutputTokens };
		if (uncached < 0) {
			console.warn(
				`[CodexModelProvider] codex usage is inconsistent: input_tokens ${usage.inputTokens} is below cached ${usage.cachedInputTokens} + cache write ${usage.cacheWriteInputTokens}; its cost cannot be estimated`
			);
			return {
				inputTokens: 0,
				outputTokens: usage.outputTokens,
				cacheReadTokens: usage.cachedInputTokens,
				cacheWriteTokens: usage.cacheWriteInputTokens,
				usageInconsistent: true,
				...reasoning,
			};
		}
		return {
			inputTokens: uncached,
			outputTokens: usage.outputTokens,
			cacheReadTokens: usage.cachedInputTokens,
			cacheWriteTokens: usage.cacheWriteInputTokens,
			...reasoning,
		};
	}

	/** The usage of a turn.completed, or undefined (with one warning) when a required field is not a number. */
	private readUsage(raw: Record<string, unknown> | undefined): CodexUsage | undefined {
		const input = raw?.['input_tokens'];
		const cached = raw?.['cached_input_tokens'];
		const cacheWrite = raw?.['cache_write_input_tokens'];
		const output = raw?.['output_tokens'];
		const reasoning = raw?.['reasoning_output_tokens'];
		if (
			typeof input !== 'number' ||
			typeof cached !== 'number' ||
			typeof cacheWrite !== 'number' ||
			typeof output !== 'number'
		) {
			if (!this.warnedUnknown.has('usage')) {
				this.warnedUnknown.add('usage');
				console.warn(
					'[CodexModelProvider] codex turn.completed usage lacks a numeric input_tokens, cached_input_tokens, cache_write_input_tokens or output_tokens: its tokens and cost are unknown -- the codex JSONL schema may have changed'
				);
			}
			return undefined;
		}
		return {
			inputTokens: input,
			cachedInputTokens: cached,
			cacheWriteInputTokens: cacheWrite,
			outputTokens: output,
			reasoningOutputTokens: typeof reasoning === 'number' ? reasoning : undefined,
		};
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
				// Cumulative for the thread: the latest usable turn replaces the earlier ones
				const usage = this.readUsage(isRecord(raw['usage']) ? raw['usage'] : undefined);
				if (usage !== undefined) {
					this.usage = usage;
				}
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
