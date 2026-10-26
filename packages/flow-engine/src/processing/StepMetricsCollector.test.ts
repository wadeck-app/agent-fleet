import { describe, expect, it, vi } from 'vitest';

import { StepMetricsCollector } from './StepMetricsCollector';
import type { StreamJsonEvent } from './StreamJsonParser';

function assistant(...blocks: Record<string, unknown>[]): StreamJsonEvent {
	return { type: 'assistant', subtype: 'tool_use', data: { message: { content: blocks as never } } };
}

function toolUse(id: string, name: string, input: Record<string, unknown>): Record<string, unknown> {
	return { type: 'tool_use', id, name, input };
}

function toolResult(id: string, isError = false): StreamJsonEvent {
	return {
		type: 'user',
		subtype: 'tool_result',
		data: { message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x', is_error: isError }] } },
	};
}

describe('StepMetricsCollector -- claude', () => {
	it('counts every tool_use block of a multi-block assistant message, not only the first', () => {
		const collector = new StepMetricsCollector('claude');

		collector.observe(
			assistant(
				{ type: 'text', text: 'working' },
				toolUse('a', 'Bash', { command: 'ls' }),
				toolUse('b', 'Read', { file_path: '/x' }),
				toolUse('c', 'Bash', { command: 'pwd' })
			)
		);

		expect(collector.snapshot().toolCalls).toEqual({ total: 3, by_tool: { Bash: 2, Read: 1 } });
	});

	it('counts a tool_use block id seen twice only once', () => {
		const collector = new StepMetricsCollector('claude');

		collector.observe(assistant(toolUse('a', 'Bash', { command: 'ls' })));
		collector.observe(assistant(toolUse('a', 'Bash', { command: 'ls' })));

		expect(collector.snapshot().toolCalls?.total).toBe(1);
	});

	it('reports 0 tool calls (observed none) and no files when only text was streamed', () => {
		const collector = new StepMetricsCollector('claude');

		collector.observe({
			type: 'assistant',
			subtype: 'text',
			data: { message: { content: [{ type: 'text', text: 'hi' }] } },
		});

		expect(collector.snapshot()).toEqual({ toolCalls: { total: 0, by_tool: {} } });
	});

	it('takes turns from the result event num_turns and leaves it undefined without one', () => {
		const collector = new StepMetricsCollector('claude');
		expect(collector.snapshot().turns).toBeUndefined();

		collector.observe({ type: 'result', subtype: 'success', data: { num_turns: 12 } });

		expect(collector.snapshot().turns).toBe(12);
	});

	it('records Write, Edit, MultiEdit file_path and NotebookEdit notebook_path as distinct files written', () => {
		const collector = new StepMetricsCollector('claude');

		collector.observe(
			assistant(
				toolUse('1', 'Write', { file_path: '/a.ts' }),
				toolUse('2', 'Edit', { file_path: '/a.ts' }),
				toolUse('3', 'MultiEdit', { file_path: '/b.ts' }),
				toolUse('4', 'NotebookEdit', { notebook_path: '/n.ipynb' }),
				toolUse('5', 'Read', { file_path: '/never.ts' })
			)
		);

		const snapshot = collector.snapshot();
		expect(snapshot.filesWritten).toEqual(['/a.ts', '/b.ts', '/n.ipynb']);
		expect(snapshot.filesWrittenCount).toBe(3);
	});

	it('drops a path whose only write came back as an error tool_result', () => {
		const collector = new StepMetricsCollector('claude');
		collector.observe(
			assistant(toolUse('1', 'Write', { file_path: '/ok.ts' }), toolUse('2', 'Write', { file_path: '/bad.ts' }))
		);

		collector.observe(toolResult('2', true));
		collector.observe(toolResult('1', false));

		expect(collector.snapshot().filesWritten).toEqual(['/ok.ts']);
		expect(collector.snapshot().filesWrittenCount).toBe(1);
		// The call still happened: errored calls are counted
		expect(collector.snapshot().toolCalls?.total).toBe(2);
	});

	it('keeps a path when one write of it failed but another succeeded', () => {
		const collector = new StepMetricsCollector('claude');
		collector.observe(
			assistant(toolUse('1', 'Write', { file_path: '/a.ts' }), toolUse('2', 'Edit', { file_path: '/a.ts' }))
		);

		collector.observe(toolResult('1', true));

		expect(collector.snapshot().filesWritten).toEqual(['/a.ts']);
	});

	it('caps the stored paths at 100 and 500 chars each while filesWrittenCount keeps the true total', () => {
		const collector = new StepMetricsCollector('claude');
		const blocks = Array.from({ length: 130 }, (_, i) =>
			toolUse(`id${String(i)}`, 'Write', { file_path: `/f${String(i)}` })
		);
		blocks.push(toolUse('long', 'Write', { file_path: '/' + 'x'.repeat(900) }));

		collector.observe(assistant(...blocks));

		const snapshot = collector.snapshot();
		expect(snapshot.filesWritten).toHaveLength(100);
		expect(snapshot.filesWrittenCount).toBe(131);
		expect(snapshot.filesWritten?.every(p => p.length <= 500)).toBe(true);
	});

	it('caps by_tool at 50 names and folds the rest under "other" without losing the total', () => {
		const collector = new StepMetricsCollector('claude');
		const blocks = Array.from({ length: 60 }, (_, i) => toolUse(`id${String(i)}`, `mcp__s__tool${String(i)}`, {}));

		collector.observe(assistant(...blocks));

		const toolCalls = collector.snapshot().toolCalls!;
		expect(toolCalls.total).toBe(60);
		expect(Object.keys(toolCalls.by_tool)).toHaveLength(51);
		expect(toolCalls.by_tool['other']).toBe(10);
	});
});

describe('StepMetricsCollector -- opencode', () => {
	const opencodeTool = (tool: string, input: unknown, status = 'completed'): StreamJsonEvent => ({
		type: 'tool_use',
		subtype: 'tool_use',
		data: { tool, callID: 'c', input, output: '', status },
	});

	it('counts top-level tool_use events and takes turns from the result num_turns', () => {
		const collector = new StepMetricsCollector('opencode');

		collector.observe(opencodeTool('bash', { command: 'ls' }));
		collector.observe(opencodeTool('bash', { command: 'pwd' }));
		collector.observe({ type: 'result', subtype: 'result', data: { num_turns: 4 } });

		const snapshot = collector.snapshot();
		expect(snapshot.toolCalls).toEqual({ total: 2, by_tool: { bash: 2 } });
		expect(snapshot.turns).toBe(4);
	});

	it('reads written paths of write/edit/patch from filePath (field name unverified, camel and snake accepted)', () => {
		const collector = new StepMetricsCollector('opencode');

		collector.observe(opencodeTool('write', { filePath: '/a.ts' }));
		collector.observe(opencodeTool('edit', { file_path: '/b.ts' }));
		collector.observe(opencodeTool('read', { filePath: '/never.ts' }));

		expect(collector.snapshot().filesWritten).toEqual(['/a.ts', '/b.ts']);
	});

	it('does not count a write whose status is error, and warns once about a write tool with no readable path', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const collector = new StepMetricsCollector('opencode');

		collector.observe(opencodeTool('write', { filePath: '/bad.ts' }, 'error'));
		collector.observe(opencodeTool('write', { unexpected: 1 }));
		collector.observe(opencodeTool('write', { unexpected: 2 }));

		expect(collector.snapshot().filesWritten).toBeUndefined();
		expect(collector.snapshot().toolCalls?.total).toBe(3);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain('write');
		warn.mockRestore();
	});
});

describe('StepMetricsCollector -- codex', () => {
	it('counts command_execution, mcp and apply_patch events; paths come from add/update changes only', () => {
		const collector = new StepMetricsCollector('codex');
		const tool = (name: string, input: unknown): StreamJsonEvent => ({
			type: 'tool_use',
			subtype: 'tool_use',
			data: { tool: name, input },
		});

		collector.observe(tool('command_execution', { command: 'ls' }));
		collector.observe(tool('mcp__srv__do', {}));
		collector.observe(
			tool('apply_patch', {
				changes: [
					{ path: '/new.ts', kind: 'add' },
					{ path: '/old.ts', kind: 'update' },
					{ path: '/gone.ts', kind: 'delete' },
				],
			})
		);

		const snapshot = collector.snapshot();
		expect(snapshot.toolCalls).toEqual({
			total: 3,
			by_tool: { command_execution: 1, mcp__srv__do: 1, apply_patch: 1 },
		});
		expect(snapshot.filesWritten).toEqual(['/new.ts', '/old.ts']);
	});

	it('leaves turns undefined: codex result carries no turn count (one codex turn is the whole run)', () => {
		const collector = new StepMetricsCollector('codex');

		collector.observe({ type: 'result', subtype: 'result', data: { cost_usd: 0, modelUsage: {} } });

		expect(collector.snapshot().turns).toBeUndefined();
	});
});

describe('StepMetricsCollector -- construction', () => {
	it('fails fast on a provider it does not know', () => {
		expect(() => new StepMetricsCollector('gemini' as never)).toThrow(/gemini/);
	});
});
