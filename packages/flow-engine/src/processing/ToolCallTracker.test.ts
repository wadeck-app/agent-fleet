import { describe, expect, it } from 'vitest';

import type { StreamJsonEvent } from './StreamJsonParser';
import { ToolCallTracker } from './ToolCallTracker';

function claudeToolUse(id: string, name: string, input: unknown): StreamJsonEvent {
	return {
		type: 'assistant',
		subtype: 'tool_use',
		data: { message: { content: [{ type: 'tool_use', id, name, input }] } as never },
	};
}

function claudeToolResult(toolUseId: string): StreamJsonEvent {
	return {
		type: 'user',
		subtype: 'tool_result',
		data: { message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] } },
	};
}

describe('ToolCallTracker', () => {
	// The stall watchdog can only name the call it killed if someone saw it start: Claude announces a
	// tool_use in an assistant message long before the matching tool_result arrives.
	it('reports a Claude tool call as in flight from its tool_use until its tool_result', () => {
		let now = 1_000;
		const tracker = new ToolCallTracker(() => now);

		expect(tracker.observe(claudeToolUse('t1', 'Bash', { command: 'npm test' }))).toBe(true);
		expect(tracker.state()).toEqual({
			activity: { tool: 'Bash', summary: 'npm test', startedAt: 1_000 },
		});

		now = 9_000;
		expect(tracker.observe(claudeToolResult('t1'))).toBe(true);
		expect(tracker.state()).toEqual({ activity: null, lastCompletedTool: 'Bash' });
	});

	it('does not report a change for events that touch no tool call', () => {
		const tracker = new ToolCallTracker(() => 0);

		const changed = tracker.observe({
			type: 'assistant',
			subtype: 'text',
			data: { message: { content: [{ type: 'text', text: 'thinking' }] } },
		});

		expect(changed).toBe(false);
		expect(tracker.state()).toEqual({ activity: null });
	});

	it('keeps the call that has been running longest while several run in parallel', () => {
		let now = 1_000;
		const tracker = new ToolCallTracker(() => now);
		tracker.observe(claudeToolUse('t1', 'Bash', { command: 'sleep 999' }));
		now = 2_000;
		tracker.observe(claudeToolUse('t2', 'Read', { file_path: '/a/b.ts' }));

		tracker.observe(claudeToolResult('t2'));

		expect(tracker.state().activity).toEqual({ tool: 'Bash', summary: 'sleep 999', startedAt: 1_000 });
	});

	it('summarises a tool without a known argument from its input rather than leaving it blank', () => {
		const tracker = new ToolCallTracker(() => 0);

		tracker.observe(claudeToolUse('t1', 'mcp__x__do', { alpha: 1 }));

		expect(tracker.state().activity?.summary).toBe('{"alpha":1}');
	});

	it('flattens a multi-line command to one line so the failure message stays readable', () => {
		const tracker = new ToolCallTracker(() => 0);

		tracker.observe(claudeToolUse('t1', 'Bash', { command: 'cd x\n  && npm test\n' }));

		expect(tracker.state().activity?.summary).toBe('cd x && npm test');
	});

	// opencode and codex emit tool_use once the call is over, so the start was never observable:
	// inventing an in-flight call from them would blame the wrong tool.
	it('never reports a call in flight for a provider that only announces completed calls', () => {
		const tracker = new ToolCallTracker(() => 0);

		const changed = tracker.observe({
			type: 'tool_use',
			subtype: 'tool_use',
			data: { tool: 'grep', callID: 'c1', input: { pattern: 'x' }, output: 'hit', status: 'completed' },
		});

		expect(changed).toBe(true);
		expect(tracker.state()).toEqual({ activity: null, lastCompletedTool: 'grep' });
	});

	it('reports no change when the same completed tool is announced twice in a row', () => {
		const tracker = new ToolCallTracker(() => 0);
		const event: StreamJsonEvent = {
			type: 'tool_use',
			subtype: 'tool_use',
			data: { tool: 'grep', callID: 'c1', input: {}, output: '', status: 'completed' },
		};
		tracker.observe(event);

		expect(tracker.observe(event)).toBe(false);
	});
});

describe('ToolCallTracker -- final result', () => {
	const resultEvent: StreamJsonEvent = { type: 'result', subtype: 'result', data: { result: 'done' } };

	it('remembers when the final result was seen and reports it as a change (a stall report names it)', () => {
		const tracker = new ToolCallTracker(() => 5_000);

		expect(tracker.observe(resultEvent)).toBe(true);
		expect(tracker.state()).toEqual({ activity: null, finalResultAt: 5_000 });
	});

	it('forgets it when a follow-up turn starts (assistant or user event)', () => {
		let now = 5_000;
		const tracker = new ToolCallTracker(() => now);
		tracker.observe(resultEvent);

		now = 9_000;
		expect(tracker.observe(claudeToolUse('t1', 'Bash', { command: 'ls' }))).toBe(true);
		expect(tracker.state().finalResultAt).toBeUndefined();
	});

	it('keeps it across other events such as system hook events', () => {
		const tracker = new ToolCallTracker(() => 5_000);
		tracker.observe(resultEvent);

		expect(tracker.observe({ type: 'system', subtype: 'hook_response', data: {} })).toBe(false);
		expect(tracker.state().finalResultAt).toBe(5_000);
	});

	it('the latest result wins', () => {
		let now = 5_000;
		const tracker = new ToolCallTracker(() => now);
		tracker.observe(resultEvent);
		now = 8_000;
		tracker.observe(claudeToolUse('t1', 'Bash', { command: 'ls' }));
		tracker.observe(claudeToolResult('t1'));
		now = 12_000;
		tracker.observe(resultEvent);

		expect(tracker.state().finalResultAt).toBe(12_000);
	});
});
