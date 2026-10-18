type DaemonLogEntry = { ts: string; level?: string; msg: string };
type StepLogEntry = { prefix: string; timestamp: string; level?: string; message: string };

function isStepLogEntry(obj: Record<string, unknown>): obj is StepLogEntry {
	return (
		typeof obj['prefix'] === 'string' && typeof obj['timestamp'] === 'string' && typeof obj['message'] === 'string'
	);
}

function isDaemonLogEntry(obj: Record<string, unknown>): obj is DaemonLogEntry {
	return typeof obj['ts'] === 'string' && typeof obj['msg'] === 'string';
}

function formatLogTime(iso: string): string {
	const d = new Date(iso);
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	const s = String(d.getSeconds()).padStart(2, '0');
	const ms = String(d.getMilliseconds()).padStart(3, '0');
	return `${h}:${m}:${s}.${ms}`;
}

function padLogLevel(level: string): string {
	// Pad to 5 chars (e.g. "INFO ", "ERROR", "WARN ")
	return level.toUpperCase().padEnd(5, ' ').slice(0, 5);
}

/**
 * One NDJSON log line as `HH:mm:ss.SSS [LEVEL] message` (local time).
 * Lines that are not JSON, or not a known log entry, are returned unchanged; a blank line gives ''.
 */
export function formatLogLine(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		// Not valid JSON -- return as-is
		return raw;
	}

	if (typeof parsed !== 'object' || parsed === null) return raw;
	// violations-suppress: ts/no-unsafe-type-cast parsed JSON has no static shape; the fields are validated below rather than trusted
	const obj = parsed as Record<string, unknown>;

	if (isStepLogEntry(obj)) {
		const time = formatLogTime(obj.timestamp);
		const level = padLogLevel(typeof obj.level === 'string' ? obj.level : 'info');
		return `${time} [${level}] ${obj.prefix} ${obj.message}`;
	}

	if (isDaemonLogEntry(obj)) {
		const time = formatLogTime(obj.ts);
		const level = padLogLevel(typeof obj.level === 'string' ? obj.level : 'info');
		return `${time} [${level}] ${obj.msg}`;
	}

	// Unknown shape -- return raw
	return raw;
}

/** {@link formatLogLine} over a whole chunk: blank lines dropped, every kept line newline-terminated. */
export function formatLogContent(content: string): string {
	const formatted = content
		.split('\n')
		.map(formatLogLine)
		.filter(line => line !== '');
	return formatted.length > 0 ? formatted.join('\n') + '\n' : '';
}

/**
 * Returns the last N non-empty lines of content joined by newline.
 * When n <= 0, returns the original content unchanged.
 */
export function tailLines(content: string, n: number): string {
	if (n <= 0) return content;
	// Split preserving trailing empty string from final newline; filter blank trailing entry
	const lines = content.split('\n');
	// Remove a single trailing empty element produced by a terminal newline
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	const sliced = lines.slice(-n);
	return sliced.length > 0 ? sliced.join('\n') + '\n' : '';
}
