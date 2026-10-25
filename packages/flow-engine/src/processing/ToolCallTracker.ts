import type { StreamContentBlock, StreamJsonEvent } from './StreamJsonParser';

/** A tool call that has started and not yet returned. */
export interface ToolCallInFlight {
	tool: string;
	/** Main argument of the call on one line (e.g. the shell command). Not masked, not truncated. */
	summary: string;
	/** Epoch milliseconds at which the start was observed. */
	startedAt: number;
}

export interface ToolActivityState {
	/** The call running longest, or null when none is known to be running. */
	activity: ToolCallInFlight | null;
	/** Name of the last call seen to return, when there was one. */
	lastCompletedTool?: string;
	/**
	 * Epoch milliseconds at which the model's final `result` event was seen. Absent before any result and
	 * again once a follow-up turn started. A step silent after this point is a process that did not exit,
	 * not a model that stopped answering.
	 */
	finalResultAt?: number;
}

/** What an activity callback learns from one stream event. */
export interface ToolProgress extends ToolActivityState {
	/** True when this event changed the tool call state, so the observer should report it at once. */
	changed: boolean;
}

/** Arguments that best describe a call, in order of preference. */
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description'] as const;

/**
 * Follows which tool call a provider is waiting on, from its stream events.
 *
 * Only Claude lets this be known: it announces a call (assistant `tool_use` block) before running it
 * and reports the return (user `tool_result` block) separately. opencode and codex emit a single
 * top-level `tool_use` event once the call is over, so the start was never observable and nothing is
 * reported as in flight for them -- only the name of the last call that finished.
 */
export class ToolCallTracker {
	private readonly inFlight = new Map<string, ToolCallInFlight>();
	private lastCompletedTool: string | undefined;
	private finalResultAt: number | undefined;

	constructor(private readonly now: () => number = Date.now) {}

	/** Feeds one stream event. Returns true when {@link state} differs from before it. */
	observe(event: StreamJsonEvent): boolean {
		const before = this.signature();
		switch (event.type) {
			case 'assistant':
				// A new turn after a result: the model is working again
				this.finalResultAt = undefined;
				this.observeBlocks(event, block => this.start(block));
				break;
			case 'user':
				this.finalResultAt = undefined;
				this.observeBlocks(event, block => this.finish(block));
				break;
			case 'result':
				this.finalResultAt = this.now();
				break;
			case 'tool_use': {
				const tool = event.data['tool'];
				if (typeof tool === 'string' && tool !== '') {
					this.lastCompletedTool = tool;
				}
				break;
			}
			default:
				// Any other event says nothing about tool calls.
				break;
		}
		return this.signature() !== before;
	}

	state(): ToolActivityState {
		const state: ToolActivityState = { activity: this.oldest() };
		if (this.lastCompletedTool !== undefined) {
			state.lastCompletedTool = this.lastCompletedTool;
		}
		if (this.finalResultAt !== undefined) {
			state.finalResultAt = this.finalResultAt;
		}
		return state;
	}

	private observeBlocks(event: StreamJsonEvent, visit: (block: StreamContentBlock) => void): void {
		const content = event.data.message?.content;
		if (!Array.isArray(content)) {
			return;
		}
		for (const block of content) {
			visit(block);
		}
	}

	private start(block: StreamContentBlock): void {
		// Without an id the matching result could never be paired, and the call would look
		// in flight forever.
		if (block.type !== 'tool_use' || typeof block.id !== 'string') {
			return;
		}
		this.inFlight.set(block.id, {
			tool: block.name ?? 'unknown',
			summary: summarize(block.input),
			startedAt: this.now(),
		});
	}

	private finish(block: StreamContentBlock): void {
		if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') {
			return;
		}
		const call = this.inFlight.get(block.tool_use_id);
		if (call === undefined) {
			return;
		}
		this.inFlight.delete(block.tool_use_id);
		this.lastCompletedTool = call.tool;
	}

	private oldest(): ToolCallInFlight | null {
		let oldest: ToolCallInFlight | null = null;
		for (const call of this.inFlight.values()) {
			if (oldest === null || call.startedAt < oldest.startedAt) {
				oldest = call;
			}
		}
		return oldest;
	}

	private signature(): string {
		const call = this.oldest();
		return JSON.stringify([
			call?.tool,
			call?.summary,
			call?.startedAt,
			this.inFlight.size,
			this.lastCompletedTool,
			this.finalResultAt,
		]);
	}
}

function summarize(input: unknown): string {
	if (typeof input !== 'object' || input === null) {
		return '';
	}
	for (const key of SUMMARY_KEYS) {
		const value = Reflect.get(input, key);
		if (typeof value === 'string' && value !== '') {
			return oneLine(value);
		}
	}
	return oneLine(JSON.stringify(input) ?? '');
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
