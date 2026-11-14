import type { HostToolCallReply } from './HostToolCallTypes';
import { Utf8Boundary } from './Utf8Boundary';

export interface HostToolFormatInput {
	toolId: string;
	/** What was captured of stdout (the head, at most the cap). */
	stdout: Buffer;
	/** True when the process wrote more than was captured. */
	stdoutTruncated: boolean;
	/** The tail of stderr. */
	stderr: Buffer;
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	timeoutSeconds: number;
	/** The whole reply text must fit in this many UTF-8 bytes (the connection drops anything larger). */
	maxOutputBytes: number;
	/** Extra lines for the model, before the data (for example a problem while stopping the process). */
	notes: readonly string[];
}

const OPEN_TAG_END = 'untrusted="true">';
const CLOSE_TAG = '</tool-output>';
/** Digits of the largest cap (1 MiB) plus slack: the marker length is bounded before the kept size is known. */
const MARKER_SLACK = '9999999999';

/**
 * Turns what a host tool printed into the reply text for the model (F-07): the output is DATA, wrapped in a delimited
 * block marked untrusted, with the exit code after it. A closing tag inside the output is defused so that the block
 * cannot be ended early. The whole text fits `maxOutputBytes`; stdout is cut on a UTF-8 boundary with a clear marker.
 */
export class HostToolReplyFormatter {
	/** The model gets at most this much of the end of stderr, whatever the stdout cap is. */
	static readonly STDERR_TAIL_BYTES = 4096;

	static format(input: HostToolFormatInput): HostToolCallReply {
		const ok = !input.timedOut && input.signal === null && input.exitCode === 0;
		const stdout = HostToolReplyFormatter.escape(
			(input.stdoutTruncated ? Utf8Boundary.withoutPartialTail(input.stdout) : input.stdout).toString('utf8')
		);
		const stderr = HostToolReplyFormatter.escape(
			Utf8Boundary.withoutPartialHead(
				Utf8Boundary.suffix(input.stderr, HostToolReplyFormatter.STDERR_TAIL_BYTES)
			).toString('utf8')
		);
		const base = { ok, exitCode: input.exitCode, ...(input.timedOut ? { timedOut: true } : {}) };
		const cap = input.maxOutputBytes;

		const full = HostToolReplyFormatter.build(input, stdout, stderr, input.stdoutTruncated);
		if (Buffer.byteLength(full, 'utf8') <= cap) {
			return { ...base, text: full, truncated: input.stdoutTruncated };
		}

		// Over the cap: stderr gets at most half of what is left after the envelope, stdout the rest.
		const envelope =
			Buffer.byteLength(HostToolReplyFormatter.build(input, '', '', true, MARKER_SLACK), 'utf8') +
			(stderr === '' ? 0 : Buffer.byteLength('\nstderr:\n', 'utf8'));
		const available = cap - envelope;
		if (available >= 0) {
			const stderrKept = stderr === '' ? '' : Utf8Boundary.suffixOfText(stderr, Math.floor(available / 2));
			const stderrBytes = Buffer.byteLength(stderrKept, 'utf8');
			const stdoutKept = Utf8Boundary.prefixOfText(stdout, available - stderrBytes);
			const text = HostToolReplyFormatter.build(
				input,
				stdoutKept,
				stderrKept,
				true,
				String(Buffer.byteLength(stdoutKept, 'utf8'))
			);
			if (Buffer.byteLength(text, 'utf8') <= cap) {
				return { ...base, text, truncated: true };
			}
		}
		const omitted = `Tool '${input.toolId}': output omitted, maxOutputBytes ${cap} is too small for it. ${HostToolReplyFormatter.exitLine(input)}`;
		return { ...base, text: Utf8Boundary.prefixOfText(omitted, cap), truncated: true };
	}

	private static build(
		input: HostToolFormatInput,
		stdout: string,
		stderr: string,
		truncated: boolean,
		keptBytes: string = String(Buffer.byteLength(stdout, 'utf8'))
	): string {
		const lines = [...input.notes];
		const status = HostToolReplyFormatter.statusLine(input);
		if (status !== undefined) lines.push(status);
		const header = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
		const marker = truncated ? `\n[output truncated at ${keptBytes} bytes]` : '';
		const errorBlock = stderr === '' ? '' : `\nstderr:\n${stderr}`;
		return `${header}<tool-output tool="${input.toolId}" ${OPEN_TAG_END}\n${stdout}${marker}${errorBlock}\n${CLOSE_TAG}\n${HostToolReplyFormatter.exitLine(input)}`;
	}

	private static statusLine(input: HostToolFormatInput): string | undefined {
		if (input.timedOut) {
			return `Tool '${input.toolId}' timed out after ${input.timeoutSeconds} s and was stopped (the process and its children were ended). The output below is partial.`;
		}
		if (input.signal !== null) {
			return `Tool '${input.toolId}' was ended by signal ${input.signal} before it finished.`;
		}
		if (input.exitCode !== 0) {
			return `Tool '${input.toolId}' failed with exit code ${String(input.exitCode)}. Check the arguments, or the output below.`;
		}
		return undefined;
	}

	private static exitLine(input: HostToolFormatInput): string {
		if (input.exitCode !== null) return `exit code: ${input.exitCode}`;
		return input.timedOut ? 'exit code: none (timed out)' : `exit code: none (signal ${String(input.signal)})`;
	}

	/** A closing tag in the output must not end the data block. */
	private static escape(text: string): string {
		return text.replaceAll('</tool-output', '<\\/tool-output');
	}
}
