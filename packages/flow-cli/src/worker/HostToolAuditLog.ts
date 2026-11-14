import type { HostTool } from 'flow-engine';
import * as crypto from 'node:crypto';

export type HostToolCallOutcome = 'ok' | 'failed' | 'timed_out' | 'denied' | 'error' | 'aborted';

/** What is known about one call once it is over. Output, environment values and tokens have no field here on purpose. */
export interface HostToolAuditEntry {
	/** The declared tool, or undefined when the id was not declared. */
	tool: HostTool | undefined;
	toolId: string;
	callId: string;
	/** Untrusted, as the model sent it. Only names and hashes are derived from it (values only for `log: true`). */
	rawArgs: unknown;
	/** True when the checker accepted the arguments: only then may a `log: true` value be kept. */
	validated: boolean;
	outcome: HostToolCallOutcome;
	/** Why a call was denied or failed before running. */
	reason?: string;
	exitCode: number | null;
	durationMs: number;
	/** Size of the reply text, never its content. */
	outputBytes: number;
	truncated: boolean;
	timedOut: boolean;
	/** Declared env NAMES that were never passed. */
	envDenied: readonly string[];
	/** Declared env NAMES the worker did not have. */
	envMissing: readonly string[];
}

const MAX_ARGUMENT_NAMES = 32;
const MAX_NAME_LENGTH = 64;
const MAX_REASON_LENGTH = 300;
const LINE_PREFIX = '[host-tool] ';
const VISIBLE_ESCAPES: Readonly<Record<string, string>> = { '\r': '\\r', '\n': '\\n', '\t': '\\t' };
/** C0 (including NUL, ESC), DEL and C1 control characters. */
const isControlCharacter = (character: string): boolean => {
	const code = character.codePointAt(0) ?? 0;
	return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
};

/**
 * One execution-log line per host tool call (F-17): step, tool, call id, argument NAMES with the sha256 of each value
 * (the value itself only for arguments declared `log: true`, and only for a call that passed the argument check), exit
 * code, duration, output SIZE, truncation, timeout, and the reason for a denied call. Never the output, never an
 * environment value, never a token. The line goes through `write`, which the worker binds to its log channel, where the
 * secret masker is applied.
 */
export class HostToolAuditLog {
	constructor(
		private readonly stepId: string,
		private readonly write: (line: string) => void
	) {}

	record(entry: HostToolAuditEntry): void {
		const line = {
			stepId: this.stepId,
			toolId: HostToolAuditLog.clean(entry.toolId, MAX_NAME_LENGTH),
			callId: HostToolAuditLog.clean(entry.callId, MAX_NAME_LENGTH),
			outcome: entry.outcome,
			...(entry.reason === undefined ? {} : { reason: HostToolAuditLog.clean(entry.reason, MAX_REASON_LENGTH) }),
			args: this.describeArguments(entry),
			exitCode: entry.exitCode,
			durationMs: entry.durationMs,
			outputBytes: entry.outputBytes,
			truncated: entry.truncated,
			timedOut: entry.timedOut,
			envDenied: [...entry.envDenied],
			envMissing: [...entry.envMissing],
		};
		this.write(`${LINE_PREFIX}${JSON.stringify(line)}`);
	}

	private describeArguments(entry: HostToolAuditEntry): Record<string, { sha256: string; value?: unknown }> {
		const described: Record<string, { sha256: string; value?: unknown }> = {};
		const raw = entry.rawArgs;
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return described;
		for (const [name, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_ARGUMENT_NAMES)) {
			const shortName = HostToolAuditLog.clean(name, MAX_NAME_LENGTH);
			const keepValue =
				entry.validated && entry.tool?.args !== undefined && Object.hasOwn(entry.tool.args, name)
					? entry.tool.args[name]!.log === true
					: false;
			described[shortName] = { sha256: HostToolAuditLog.hash(value), ...(keepValue ? { value } : {}) };
		}
		return described;
	}

	/**
	 * Text the model controls (argument names, tool and call ids, error text quoting them) made single-line and printable:
	 * CR, LF and tab become the two characters `\r`, `\n`, `\t`; any other control character becomes `?`. The cut comes
	 * AFTER the replacement, on a whole replacement, so no escape is split.
	 */
	static clean(text: string, maxLength: number): string {
		let cleaned = '';
		for (const character of text) {
			const replacement = isControlCharacter(character) ? (VISIBLE_ESCAPES[character] ?? '?') : character;
			if (cleaned.length + replacement.length > maxLength) break;
			cleaned += replacement;
		}
		return cleaned;
	}

	private static hash(value: unknown): string {
		const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
		return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
	}
}
