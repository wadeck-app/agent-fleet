import type { ModelProviderName } from '../types';
import type { StreamContentBlock, StreamJsonEvent } from './StreamJsonParser';

/** Distinct tool names kept in `by_tool`; later names are counted under {@link OTHER_TOOLS}. */
export const MAX_TOOL_NAMES = 50;
/** `by_tool` key for the calls of tools past {@link MAX_TOOL_NAMES}. */
export const OTHER_TOOLS = 'other';
/** Distinct written paths kept in `files_written`; `files_written_count` keeps the true total. */
export const MAX_FILES_WRITTEN = 100;
/** Characters kept of one written path. */
export const MAX_FILE_PATH_CHARS = 500;

/** What was observed of one attempt. A field is absent when the provider cannot show it. */
export interface StepMetricsSnapshot {
	turns?: number;
	toolCalls: { total: number; by_tool: Record<string, number> };
	filesWritten?: string[];
	filesWrittenCount?: number;
}

/** Claude tools that write a file, and the input field holding the path. */
const CLAUDE_WRITE_TOOLS: Readonly<Record<string, string>> = {
	Write: 'file_path',
	Edit: 'file_path',
	MultiEdit: 'file_path',
	NotebookEdit: 'notebook_path',
};

/** opencode tools that write a file. The input field name is UNVERIFIED against a real capture. */
const OPENCODE_WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'patch']);
const OPENCODE_PATH_FIELDS = ['filePath', 'file_path', 'path'] as const;

/** codex `apply_patch` change kinds that leave a file written. */
const CODEX_WRITE_KINDS: ReadonlySet<string> = new Set(['add', 'update']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Counts what one model attempt did, from the provider's stream events: turns, tool calls and files
 * written through the provider's file tools.
 *
 * Observation only. Anything a provider does not expose stays absent rather than zero (codex has no turn
 * count; writes made through a shell command are invisible to every provider). In-flight tracking lives in
 * `ToolCallTracker`, which this does not replace.
 */
export class StepMetricsCollector {
	private turns: number | undefined;
	private total = 0;
	private readonly byTool = new Map<string, number>();
	private otherCount = 0;
	/** Call id (or a synthetic key) to the path that call wrote; an errored call is removed. */
	private readonly writes = new Map<string, string>();
	/** Claude tool_use ids already counted: the same block may be streamed more than once. */
	private readonly seenToolUseIds = new Set<string>();
	private readonly warnedTools = new Set<string>();
	private syntheticKeys = 0;

	constructor(private readonly provider: ModelProviderName) {
		switch (provider) {
			case 'claude':
			case 'opencode':
			case 'codex':
				break;
			default:
				throw new Error(
					`StepMetricsCollector does not know provider '${String(provider)}': add how its stream shows turns, tool calls and written files.`
				);
		}
	}

	observe(event: StreamJsonEvent): void {
		// Event types that say nothing about turns, tools or files (system, text, ...) fall through untouched
		const isClaude = this.provider === 'claude';
		if (event.type === 'assistant' && isClaude) {
			this.forEachBlock(event, block => this.observeClaudeToolUse(block));
		} else if (event.type === 'user' && isClaude) {
			this.forEachBlock(event, block => this.observeClaudeToolResult(block));
		} else if (event.type === 'tool_use' && !isClaude) {
			// claude never emits a top-level tool_use: opencode and codex announce a call once it is over
			this.observeFinishedToolCall(event);
		} else if (event.type === 'result') {
			const turns = event.data.num_turns;
			// A later result describes the whole process so far and replaces the earlier one
			this.turns = typeof turns === 'number' ? turns : this.turns;
		}
	}

	snapshot(): StepMetricsSnapshot {
		const by_tool = Object.fromEntries(this.byTool);
		if (this.otherCount > 0) {
			by_tool[OTHER_TOOLS] = this.otherCount;
		}
		const snapshot: StepMetricsSnapshot = { toolCalls: { total: this.total, by_tool } };
		if (this.turns !== undefined) {
			snapshot.turns = this.turns;
		}
		const distinct = [...new Set(this.writes.values())];
		if (distinct.length > 0) {
			snapshot.filesWritten = distinct.slice(0, MAX_FILES_WRITTEN).map(p => p.slice(0, MAX_FILE_PATH_CHARS));
			snapshot.filesWrittenCount = distinct.length;
		}
		return snapshot;
	}

	private forEachBlock(event: StreamJsonEvent, visit: (block: StreamContentBlock) => void): void {
		const content = event.data.message?.content;
		if (!Array.isArray(content)) {
			return;
		}
		for (const block of content) {
			visit(block);
		}
	}

	private observeClaudeToolUse(block: StreamContentBlock): void {
		if (block.type !== 'tool_use') {
			return;
		}
		if (typeof block.id === 'string') {
			if (this.seenToolUseIds.has(block.id)) {
				return;
			}
			this.seenToolUseIds.add(block.id);
		}
		const name = block.name ?? 'unknown';
		this.count(name);
		const pathField = Object.hasOwn(CLAUDE_WRITE_TOOLS, name) ? CLAUDE_WRITE_TOOLS[name] : undefined;
		const filePath = pathField !== undefined && isRecord(block.input) ? block.input[pathField] : undefined;
		if (typeof filePath === 'string' && filePath !== '') {
			this.writes.set(block.id ?? this.syntheticKey(), filePath);
		}
	}

	private observeClaudeToolResult(block: StreamContentBlock): void {
		if (block.type === 'tool_result' && block.is_error === true && typeof block.tool_use_id === 'string') {
			this.writes.delete(block.tool_use_id);
		}
	}

	private observeFinishedToolCall(event: StreamJsonEvent): void {
		const tool = event.data['tool'];
		const name = typeof tool === 'string' && tool !== '' ? tool : 'unknown';
		this.count(name);
		const failed = event.data['status'] === 'error';
		const input = event.data['input'];
		if (this.provider === 'opencode') {
			this.recordOpenCodeWrite(name, input, failed);
		} else if (name === 'apply_patch' && !failed) {
			this.recordCodexPatch(input);
		}
	}

	private recordOpenCodeWrite(name: string, input: unknown, failed: boolean): void {
		if (!OPENCODE_WRITE_TOOLS.has(name) || failed) {
			return;
		}
		const record = isRecord(input) ? input : {};
		for (const field of OPENCODE_PATH_FIELDS) {
			const value = record[field];
			if (typeof value === 'string' && value !== '') {
				this.writes.set(this.syntheticKey(), value);
				return;
			}
		}
		// Silent under-reporting is the failure mode of an unverified field name: say it once per tool
		if (!this.warnedTools.has(name)) {
			this.warnedTools.add(name);
			console.warn(
				`[StepMetricsCollector] opencode '${name}' call has no path in its input (looked for ${OPENCODE_PATH_FIELDS.join(', ')}): its file is not counted in files_written. The input field names are unverified; capture a real opencode run and update OPENCODE_PATH_FIELDS.`
			);
		}
	}

	private recordCodexPatch(input: unknown): void {
		const changes = isRecord(input) && Array.isArray(input['changes']) ? input['changes'] : [];
		for (const change of changes) {
			if (!isRecord(change)) {
				continue;
			}
			const filePath = change['path'];
			const kind = change['kind'];
			if (
				typeof filePath === 'string' &&
				filePath !== '' &&
				typeof kind === 'string' &&
				CODEX_WRITE_KINDS.has(kind)
			) {
				this.writes.set(this.syntheticKey(), filePath);
			}
		}
	}

	private count(name: string): void {
		this.total++;
		const known = this.byTool.get(name);
		if (known !== undefined) {
			this.byTool.set(name, known + 1);
		} else if (this.byTool.size < MAX_TOOL_NAMES) {
			this.byTool.set(name, 1);
		} else {
			this.otherCount++;
		}
	}

	private syntheticKey(): string {
		return `call#${String(this.syntheticKeys++)}`;
	}
}
