/**
 * StreamEventMapper
 *
 * Maps StreamJsonEvent objects from Claude CLI stream-json output
 * to LiveLogEntry objects for display in the web UI.
 */
import type { LiveLogEntry } from '../types';
import type { StreamJsonEvent } from './StreamJsonParser';

// Maximum entries per step to prevent memory issues
const MAX_LIVE_LOG_ENTRIES = 1000;

/**
 * Maps stream events to LiveLogEntry objects with smart filtering
 */
export class StreamEventMapper {
	private counter = 0;
	private readonly stepId: string;

	constructor(stepId: string) {
		this.stepId = stepId;
	}

	/**
	 * Map a stream event to zero or more LiveLogEntry objects.
	 * Returns an empty array for events that should be filtered out.
	 * Returns multiple entries for OpenCode tool_use events (input + output).
	 */
	map(event: StreamJsonEvent): LiveLogEntry[] {
		switch (event.type) {
			case 'system': {
				const e = this.mapSystemEvent(event);
				return [e];
			}
			case 'assistant': {
				const e = this.mapAssistantEvent(event);
				return e ? [e] : [];
			}
			case 'user': {
				const e = this.mapUserEvent(event);
				return e ? [e] : [];
			}
			case 'result': {
				const e = this.mapResultEvent(event);
				return [e];
			}
			// hook events are emitted when --include-hook-events is passed.
			// NOTE: the exact schema has not been verified against a live Claude run.
			// Observed structure (tentative): { type: "hook_event", hook: { type, matcher }, tool_name?, timing? }
			case 'hook_event': {
				const e = this.mapHookEvent(event);
				return [e];
			}
			// OpenCode emits 'text' events for streamed assistant text chunks
			case 'text': {
				const text = event.data.text as string | undefined;
				if (!text) return [];
				return [
					{
						id: this.nextId(),
						timestamp: Date.now(),
						level: 'info',
						message: text,
						eventType: 'assistant_text',
					},
				];
			}
			// OpenCode emits 'tool_use' events after tool completion with both input + output
			case 'tool_use': {
				const tool = (event.data.tool as string | undefined) ?? 'unknown';
				const input = event.data.input;
				const output = (event.data.output as string | undefined) ?? '';
				const inputSummary = this.summarizeToolInput(input);
				const entries: LiveLogEntry[] = [
					{
						id: this.nextId(),
						timestamp: Date.now(),
						level: 'warning',
						message: `${tool}(${inputSummary})`,
						eventType: 'tool_use',
						metadata: { toolName: tool, input },
					},
				];
				if (output) {
					entries.push({
						id: this.nextId(),
						timestamp: Date.now(),
						level: 'debug',
						message: output,
						eventType: 'tool_result',
						metadata: { toolName: tool },
					});
				}
				return entries;
			}
			default:
				return [];
		}
	}

	/**
	 * Apply cap to liveLogEntries array, dropping oldest debug entries first
	 */
	static capEntries(entries: LiveLogEntry[]): LiveLogEntry[] {
		if (entries.length <= MAX_LIVE_LOG_ENTRIES) {
			return entries;
		}

		// Separate debug and non-debug entries
		const debugEntries = entries.filter(e => e.level === 'debug');
		const nonDebugEntries = entries.filter(e => e.level !== 'debug');

		// If removing all debug entries is enough, keep all non-debug + some debug
		if (nonDebugEntries.length <= MAX_LIVE_LOG_ENTRIES) {
			const remainingSlots = MAX_LIVE_LOG_ENTRIES - nonDebugEntries.length;
			// Keep the most recent debug entries
			const keptDebug = debugEntries.slice(-remainingSlots);
			// Merge and sort by timestamp
			return [...nonDebugEntries, ...keptDebug].sort((a, b) => a.timestamp - b.timestamp);
		}

		// Even non-debug exceeds cap -- keep most recent entries
		return entries.slice(-MAX_LIVE_LOG_ENTRIES);
	}

	private nextId(): string {
		return `${this.stepId}-live-${this.counter++}`;
	}

	private mapSystemEvent(event: StreamJsonEvent): LiveLogEntry {
		const data = event.data;
		const model = data.model || 'unknown';
		const tools = data.tools;
		const toolCount = Array.isArray(tools) ? tools.length : 0;

		return {
			id: this.nextId(),
			timestamp: Date.now(),
			level: 'debug',
			message: `Session: ${model}, ${toolCount} tools`,
			eventType: 'system',
			metadata: { model, toolCount, raw: data },
		};
	}

	private mapAssistantEvent(event: StreamJsonEvent): LiveLogEntry | null {
		const content = event.data.message?.content;
		if (!Array.isArray(content) || content.length === 0) {
			return null;
		}

		const firstBlock = content[0];

		if (firstBlock.type === 'text') {
			const text = firstBlock.text || '';

			return {
				id: this.nextId(),
				timestamp: Date.now(),
				level: 'info',
				message: `Claude: ${text}`,
				eventType: 'assistant_text',
			};
		}

		if (firstBlock.type === 'tool_use') {
			const toolName = firstBlock.name || 'unknown';
			const input = firstBlock.input;
			const inputSummary = this.summarizeToolInput(input);

			return {
				id: this.nextId(),
				timestamp: Date.now(),
				level: 'warning',
				message: `Tool: ${toolName}(${inputSummary})`,
				eventType: 'tool_use',
				metadata: { toolName, input },
			};
		}

		return null;
	}

	private mapUserEvent(event: StreamJsonEvent): LiveLogEntry | null {
		const content = event.data.message?.content;
		if (!Array.isArray(content) || content.length === 0) {
			return null;
		}

		const firstBlock = content[0];

		if (firstBlock.type === 'tool_result') {
			const toolUseId = firstBlock.tool_use_id || 'unknown';
			const resultContent =
				typeof firstBlock.content === 'string' ? firstBlock.content : JSON.stringify(firstBlock.content);

			return {
				id: this.nextId(),
				timestamp: Date.now(),
				level: 'debug',
				message: `Tool result [${toolUseId}]: ${resultContent}`,
				eventType: 'tool_result',
				metadata: { toolUseId },
			};
		}

		return null;
	}

	private mapResultEvent(event: StreamJsonEvent): LiveLogEntry {
		const data = event.data;
		const numTurns = data.num_turns ?? '?';
		const cost = data.cost_usd != null ? `$${data.cost_usd}` : '$?';
		const durationSeconds = data.duration_ms != null ? `${(data.duration_ms / 1000).toFixed(1)}s` : '?s';
		const resultText = data.result || '';

		return {
			id: this.nextId(),
			timestamp: Date.now(),
			level: 'info',
			message: `Completed: ${numTurns} turns, ${cost} USD, ${durationSeconds}`,
			eventType: 'result',
			metadata: { numTurns, cost: data.cost_usd, durationMs: data.duration_ms, resultText },
		};
	}

	// Schema assumed from Claude Code source. Verify with --include-hook-events on a real run if behavior is unexpected.
	private mapHookEvent(event: StreamJsonEvent): LiveLogEntry {
		const data = event.data;
		// NOTE: schema is tentative -- not verified against a live Claude run.
		// data.hook?.type is expected to be 'PreToolUse' or 'PostToolUse'.
		const hookType: string = data['hook']?.type ?? data['hook_type'] ?? 'unknown';
		const toolName: string = data['tool_name'] ?? 'unknown';

		return {
			id: this.nextId(),
			timestamp: Date.now(),
			level: 'debug',
			message: `Hook [${hookType}]: ${toolName}`,
			eventType: 'hook_event',
			metadata: { hookType, toolName, raw: data },
		};
	}

	/**
	 * Create a short summary of tool input for log display.
	 * File paths are shown in full (or smartly truncated to keep the filename visible).
	 */
	private summarizeToolInput(input: any): string {
		if (!input || typeof input !== 'object') {
			return '';
		}

		const keys = Object.keys(input);
		if (keys.length === 0) {
			return '';
		}

		// Show first few key=value pairs
		const parts: string[] = [];
		let totalLength = 0;

		for (const key of keys) {
			if (totalLength > 300) {
				parts.push('...');
				break;
			}

			const value = input[key];
			let valueStr: string;
			if (typeof value === 'string') {
				valueStr = this.truncateValue(key, value);
			} else {
				valueStr = JSON.stringify(value);
				if (valueStr.length > 80) {
					valueStr = valueStr.substring(0, 80) + '...';
				}
			}

			const part = `${key}=${valueStr}`;
			parts.push(part);
			totalLength += part.length;
		}

		return parts.join(', ');
	}

	/**
	 * Truncate a value for display.
	 * File paths are never truncated -- they're critical for understanding what happened.
	 */
	private truncateValue(key: string, value: string): string {
		// Never truncate file paths -- the full path is essential context
		const isPathKey = /path|file|dir/i.test(key);
		if (isPathKey) {
			return value;
		}

		if (value.length > 120) {
			return value.substring(0, 120) + '...';
		}
		return value;
	}
}
