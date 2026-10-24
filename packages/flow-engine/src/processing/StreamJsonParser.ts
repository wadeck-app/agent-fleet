/**
 * StreamJsonParser
 *
 * Parses NDJSON (newline-delimited JSON) output from Claude CLI's --output-format=stream-json.
 * Buffers partial lines from stdout chunks and emits typed StreamJsonEvent objects.
 */

/**
 * One content block of a stream-json assistant/user message
 */
export interface StreamContentBlock {
	type?: string;
	text?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: unknown;
}

/**
 * Raw parsed JSON object of a stream-json event. Only the fields read by this package are
 * declared; any other field stays reachable as `unknown` through the index signature.
 */
export interface StreamEventData {
	type?: string;
	subtype?: string;
	session_id?: string;
	model?: string;
	result?: string;
	num_turns?: number;
	total_cost_usd?: number;
	cost_usd?: number;
	duration_ms?: number;
	compact_result?: string;
	compact_error?: string;
	compact_metadata?: Record<string, unknown>;
	hook?: { type?: string };
	hook_type?: string;
	tool_name?: string;
	message?: { content?: StreamContentBlock[] | string };
	[key: string]: unknown;
}

/**
 * Typed event from Claude CLI stream-json output
 */
export interface StreamJsonEvent {
	/** Event type: 'system', 'assistant', 'user', 'result' */
	type: string;
	/** Subtype extracted from message content (e.g., 'text', 'tool_use', 'tool_result') */
	subtype?: string;
	/** Full parsed JSON object */
	data: StreamEventData;
}

/**
 * Callback for stream events
 */
export type StreamJsonEventCallback = (event: StreamJsonEvent) => void;

/**
 * NDJSON line parser for Claude CLI stream-json output
 */
export class StreamJsonParser {
	private buffer: string = '';
	private readonly onEvent: StreamJsonEventCallback;

	constructor(onEvent: StreamJsonEventCallback) {
		this.onEvent = onEvent;
	}

	/**
	 * Feed a chunk of data from stdout.
	 * Buffers partial lines and emits events for complete JSON lines.
	 */
	feed(chunk: string): void {
		this.buffer += chunk;

		// Process complete lines
		let newlineIndex: number;
		while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
			const line = this.buffer.substring(0, newlineIndex).trim();
			this.buffer = this.buffer.substring(newlineIndex + 1);

			if (line.length === 0) {
				continue;
			}

			this.parseLine(line);
		}
	}

	/**
	 * Flush any remaining buffer content.
	 * Call this when the process exits to handle any trailing data.
	 */
	flush(): void {
		const remaining = this.buffer.trim();
		this.buffer = '';

		if (remaining.length > 0) {
			this.parseLine(remaining);
		}
	}

	/**
	 * Parse a single line as JSON and emit a StreamJsonEvent
	 */
	private parseLine(line: string): void {
		try {
			const data = JSON.parse(line);
			const event = this.classifyEvent(data);
			this.onEvent(event);
		} catch {
			// Silently skip non-JSON lines (Claude CLI may emit setup text)
		}
	}

	/**
	 * Classify a parsed JSON object into a StreamJsonEvent
	 */
	private classifyEvent(data: StreamEventData): StreamJsonEvent {
		const type = data.type || 'unknown';
		let subtype: string | undefined;

		// Extract subtype from content for message events
		if (type === 'assistant' || type === 'user') {
			const content = data.message?.content;
			if (Array.isArray(content) && content.length > 0) {
				subtype = content[0].type;
			}
		}

		// Result events
		if (type === 'result') {
			subtype = 'result';
		}

		// System events: Claude's own events carry their subtype in the raw JSON (e.g.
		// "init", "compact_boundary") -- read it rather than hardcoding "init", which used to
		// silently relabel every system event (including compact_boundary, used by the
		// contextLimit compaction log line) as "init".
		// TODO(flow-cli): data.session_id must be captured here and returned to the caller.
		// /resume requires --resume <sessionId> -- without it, retries start a fresh conversation
		// and the correction prompt has no context. See D25.
		if (type === 'system') {
			subtype = typeof data.subtype === 'string' ? data.subtype : 'init';
		}

		return { type, subtype, data };
	}
}
