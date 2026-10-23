// Browser-safe (no node import): the host serves captured output to a web page, where an escape sequence renders as
// replacement characters. Hand-written scanner, linear in the input: no regex can backtrack catastrophically on it.

const ESC = 0x1b;
const BEL = 0x07;
const BACKSLASH = 0x5c;
const NEWLINE = 0x0a;
const TAB = 0x09;
const CARRIAGE_RETURN = 0x0d;
/** C1 control "CSI" (single-character form of ESC [). */
const CSI_C1 = 0x9b;
/** C1 control "ST" (string terminator). */
const ST_C1 = 0x9c;

// Any character the scanner may need to act on; a text without one is returned as is.
const NEEDS_WORK = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;

function isParameterByte(code: number): boolean {
	return code >= 0x30 && code <= 0x3f;
}

function isIntermediateByte(code: number): boolean {
	return code >= 0x20 && code <= 0x2f;
}

function isFinalByte(code: number): boolean {
	return code >= 0x40 && code <= 0x7e;
}

/** End index (exclusive) of a CSI sequence whose parameters start at `from`; a malformed one ends where it stops being valid. */
function endOfControlSequence(text: string, from: number): number {
	let i = from;
	while (i < text.length && isParameterByte(text.charCodeAt(i))) {
		i += 1;
	}
	while (i < text.length && isIntermediateByte(text.charCodeAt(i))) {
		i += 1;
	}
	// A final byte closes the sequence; anything else is not part of it.
	return i < text.length && isFinalByte(text.charCodeAt(i)) ? i + 1 : i;
}

/**
 * End index (exclusive) of a string sequence (OSC, DCS, APC, PM, SOS) whose body starts at `from`. It ends at BEL, ST
 * (ESC \ or the C1 form), or, when the terminator never comes, before the next ESC or newline so that a truncated
 * sequence cannot swallow the text after it.
 */
function endOfStringSequence(text: string, from: number): number {
	for (let i = from; i < text.length; i += 1) {
		const code = text.charCodeAt(i);
		if (code === BEL || code === ST_C1) {
			return i + 1;
		}
		if (code === ESC) {
			return text.charCodeAt(i + 1) === BACKSLASH ? i + 2 : i;
		}
		if (code === NEWLINE) {
			return i;
		}
	}
	return text.length;
}

/** End index (exclusive) of the escape sequence starting at the ESC at `at`. */
function endOfEscape(text: string, at: number): number {
	if (at + 1 >= text.length) {
		return text.length;
	}
	const next = text[at + 1]!;
	if (next === '[') {
		return endOfControlSequence(text, at + 2);
	}
	if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
		return endOfStringSequence(text, at + 2);
	}
	const code = next.charCodeAt(0);
	if (isIntermediateByte(code)) {
		// Charset selection and similar: ESC, intermediates, one final byte.
		let i = at + 1;
		while (i < text.length && isIntermediateByte(text.charCodeAt(i))) {
			i += 1;
		}
		return i < text.length && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x7e ? i + 1 : i;
	}
	// Two-character sequences (ESC c, ESC M, ESC 7...); an ESC before anything else is dropped alone.
	return code >= 0x30 && code <= 0x7e ? at + 2 : at + 1;
}

function isDroppedControl(code: number): boolean {
	// Tab, newline and carriage return stay (the last one is resolved later); the other C0 controls, DEL and C1 go.
	if (code === TAB || code === NEWLINE || code === CARRIAGE_RETURN) {
		return false;
	}
	return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

function removeEscapes(text: string): string {
	const parts: string[] = [];
	let kept = 0;
	let i = 0;
	while (i < text.length) {
		const code = text.charCodeAt(i);
		let end: number;
		if (code === ESC) {
			end = endOfEscape(text, i);
		} else if (code === CSI_C1) {
			end = endOfControlSequence(text, i + 1);
		} else if (isDroppedControl(code)) {
			end = i + 1;
		} else {
			i += 1;
			continue;
		}
		parts.push(text.slice(kept, i));
		kept = end;
		i = end;
	}
	parts.push(text.slice(kept));
	return parts.join('');
}

/** A line as a terminal shows it: of what was written between carriage returns, the last non-empty part wins. */
function resolveCarriageReturns(text: string): string {
	if (!text.includes('\r')) {
		return text;
	}
	return text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map(line => {
			if (!line.includes('\r')) {
				return line;
			}
			const written = line.split('\r').filter(part => part !== '');
			return written.length === 0 ? '' : written[written.length - 1]!;
		})
		.join('\n');
}

/**
 * The text without terminal control: ANSI/VT escape sequences (CSI such as colours, 256-colour and truecolour, cursor
 * moves and erasures; OSC such as window titles and OSC 8 hyperlinks, whose visible label is kept; DCS/APC/PM/SOS;
 * two-character escapes), other control characters, and progress-bar overwrites (`50%\r100%` gives `100%`; CRLF becomes LF).
 * A sequence cut at the end of the text is dropped. Never throws; plain text is returned unchanged.
 *
 * Limits: cursor movement is not emulated (a line redrawn with a cursor-up escape keeps every version), and an
 * overwrite by a shorter text keeps only the shorter text, not the tail of the longer one.
 */
export function stripAnsi(text: string): string {
	if (!NEEDS_WORK.test(text)) {
		return text;
	}
	return resolveCarriageReturns(removeEscapes(text));
}
