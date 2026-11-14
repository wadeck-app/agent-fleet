import type { FlowDefinition } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import { renderFlowSummary } from './FlowSummary.js';
import { hostToolLines } from './HostToolLines.js';

const TOOL = {
	id: 'queue-task-show',
	description: 'Show a task.',
	sideEffect: 'read',
	command: ['task', 'show', '{id}', '--json'],
	args: {
		id: { type: 'string', pattern: '^[a-z]+$', required: true },
		status: { type: 'enum', values: ['open', 'done'] },
	},
};

const flowOf = (steps: Record<string, unknown>[]): FlowDefinition =>
	({ id: 'f', name: 'F', workspace: 'in-place', steps }) as unknown as FlowDefinition;

const modelStep = (extra: Record<string, unknown>): Record<string, unknown> => ({
	id: 'triage',
	type: 'model',
	prompt: 'p',
	...extra,
});

const describeLimits = (tool: { id: string }): string => `limits-of-${tool.id}`;

describe('hostToolLines', () => {
	// [name, flow steps, describer given, expected lines]
	it.each([
		{
			name: 'nothing for a flow without hostTools',
			steps: [modelStep({}), { id: 's', type: 'script', script: 'x' }],
			describer: describeLimits,
			expected: [],
		},
		{
			name: 'nothing for an empty hostTools list',
			steps: [modelStep({ hostTools: [] })],
			describer: describeLimits,
			expected: [],
		},
		{
			name: 'the tool row: id, side effect, executable, typed arguments, then the applied limits',
			steps: [modelStep({ hostTools: [TOOL] })],
			describer: describeLimits,
			expected: [
				"tools of step 'triage':",
				'  queue-task-show [read] task args(id:string, status:enum) limits-of-queue-task-show',
			],
		},
		{
			name: 'a tool without arguments shows an empty args()',
			steps: [modelStep({ hostTools: [{ ...TOOL, args: undefined, id: 'ping' }] })],
			describer: describeLimits,
			expected: ["tools of step 'triage':", '  ping [read] task args() limits-of-ping'],
		},
		{
			name: 'without a describer the limits are not shown',
			steps: [modelStep({ hostTools: [TOOL] })],
			describer: undefined,
			expected: ["tools of step 'triage':", '  queue-task-show [read] task args(id:string, status:enum)'],
		},
		{
			name: 'one block per model step that declares tools, in step order',
			steps: [
				modelStep({ id: 'a', hostTools: [TOOL] }),
				modelStep({ id: 'b' }),
				modelStep({ id: 'c', hostTools: [{ ...TOOL, id: 'other' }] }),
			],
			describer: undefined,
			expected: [
				"tools of step 'a':",
				'  queue-task-show [read] task args(id:string, status:enum)',
				"tools of step 'c':",
				'  other [read] task args(id:string, status:enum)',
			],
		},
		{
			name: 'a malformed tool is named, not skipped or crashed on',
			steps: [modelStep({ hostTools: ['task'] })],
			describer: describeLimits,
			expected: ["tools of step 'triage':", '  (invalid host tool: run flow validate)'],
		},
		{
			name: 'a hostTools that is not a list is named',
			steps: [modelStep({ hostTools: 'task' })],
			describer: describeLimits,
			expected: ["tools of step 'triage':", '  (hostTools is not a list: run flow validate)'],
		},
	])('prints $name', ({ steps, describer, expected }) => {
		expect(hostToolLines(flowOf(steps), describer)).toEqual(expected);
	});
});

describe('renderFlowSummary with host tools', () => {
	it('prints the tools block under the step table and passes the describer through', () => {
		const text = renderFlowSummary(flowOf([modelStep({ hostTools: [TOOL] })]), undefined, describeLimits);

		expect(text).toContain("tools of step 'triage':");
		expect(text).toContain('queue-task-show [read] task args(id:string, status:enum) limits-of-queue-task-show');
		// After the table, before the footer count.
		expect(text.indexOf("tools of step 'triage':")).toBeLessThan(text.indexOf('1 steps:'));
	});

	it('prints no tools block for a flow without hostTools', () => {
		expect(renderFlowSummary(flowOf([modelStep({})]))).not.toContain('tools of step');
	});
});
