import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExecutionState } from '../execution/ExecutionState.js';
import { FlowQueryService } from '../query/FlowQueryService.js';
import { ExecutionLookupError } from '../show/ExecutionDetail.js';
import { makeExec } from '../testing/makeExec.js';
import { FlowDefinitionError } from './FlowDefinitionLoader.js';

// @formatter:off
const FLOW_YAML = `id: build_task
version: '1.0.0'
name: Build a task
steps:
  - id: plan
    name: Plan
    type: model
    prompt: plan it
  - id: test
    name: Test
    type: script
    depends: [plan]
    script: npm test
    onFailure: { goto: plan, maxIterations: 2 }
`;
// @formatter:on

describe('FlowQueryService.getFlowGraph', () => {
	let root: string;
	let service: FlowQueryService;
	let flowFile: string;

	const writeExec = (id: string, overrides: Partial<ExecutionState>) => {
		fs.writeFileSync(
			path.join(root, 'executions', `${id}.json`),
			JSON.stringify(makeExec({ executionId: id, flowId: 'build_task', flowFile, ...overrides }))
		);
	};

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-graph-'));
		fs.mkdirSync(path.join(root, 'executions'));
		flowFile = path.join(root, 'build_task.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		service = FlowQueryService.forConfigDir(root);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('by execution id: graph decorated with the run and the run header', () => {
		writeExec('abc12345', {
			status: 'failed',
			steps: {
				plan: {
					status: 'completed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:02.000Z',
				},
			},
		});

		const result = service.getFlowGraph({ executionId: 'abc12345' });

		expect(result).toMatchObject({
			flowId: 'build_task',
			flowName: 'Build a task',
			flowFile,
			execution: { executionId: 'abc12345', status: 'failed' },
		});
		expect(result.graph.nodes.map(n => [n.id, n.status])).toEqual([
			['plan', 'completed'],
			['test', 'pending'],
		]);
		expect(result.graph.edges).toHaveLength(2);
	});

	it('by execution id prefix', () => {
		writeExec('abc12345', {});

		expect(service.getFlowGraph({ executionId: 'abc1' }).execution?.executionId).toBe('abc12345');
	});

	it('by execution id: unknown id keeps the ExecutionLookupError', () => {
		expect(() => service.getFlowGraph({ executionId: 'zzzz' })).toThrow(ExecutionLookupError);
	});

	it('by execution id: a deleted flow file is a typed, actionable error', () => {
		writeExec('abc12345', { flowFile: path.join(root, 'deleted.yml') });

		expect(() => service.getFlowGraph({ executionId: 'abc12345' })).toThrow(FlowDefinitionError);
		expect(() => service.getFlowGraph({ executionId: 'abc12345' })).toThrow(/deleted\.yml/);
	});

	it('by flow file: definition only, no execution and no status', () => {
		const result = service.getFlowGraph({ flowFile });

		expect(result.execution).toBeUndefined();
		expect(result.graph.nodes.every(n => n.status === undefined)).toBe(true);
	});

	it('by flow id: uses the most recent run whose file still exists', () => {
		writeExec('old00001', { startedAt: '2026-08-01T00:00:00.000Z' });
		writeExec('new00001', { startedAt: '2026-08-10T00:00:00.000Z', flowFile: path.join(root, 'gone.yml') });

		const result = service.getFlowGraph({ flowId: 'build_task' });

		expect(result.flowFile).toBe(flowFile);
		expect(result.graph.nodes).toHaveLength(2);
	});

	it('by flow id: never run is flow-not-found', () => {
		expect(() => service.getFlowGraph({ flowId: 'nope' })).toThrow(/No execution of flow 'nope'/);
	});

	it('by flow id: every run lost its file', () => {
		writeExec('new00001', { flowFile: path.join(root, 'gone.yml') });

		expect(() => service.getFlowGraph({ flowId: 'build_task' })).toThrow(FlowDefinitionError);
		expect(() => service.getFlowGraph({ flowId: 'build_task' })).toThrow(/no longer exists.*gone\.yml/);
	});

	it('surfaces a flow that references a missing step as invalid-flow-graph', () => {
		fs.writeFileSync(
			flowFile,
			'id: bad\nname: Bad\nversion: "1"\nsteps:\n  - id: a\n    name: A\n    type: script\n    script: x\n    depends: [ghost]\n'
		);

		expect(() => service.getFlowGraph({ flowFile })).toThrow(/depends on 'ghost'/);
	});
});
