import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { definitionsDirOf } from '../config/FlowConfigLayout.js';
import { hashDefinition } from '../definitions/DefinitionHash.js';
import { DefinitionSnapshotStore } from '../definitions/DefinitionSnapshotStore.js';
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

describe('FlowQueryService.getFlowGraph with a recorded definition', () => {
	let root: string;
	let service: FlowQueryService;
	let flowFile: string;

	const hash = hashDefinition(yaml.load(FLOW_YAML));
	const snapshot = (): string => {
		const store = new DefinitionSnapshotStore(definitionsDirOf(root));
		return store.save({ flowId: 'build_task', version: '1.0.0', hash, text: FLOW_YAML }).ref;
	};
	const writeExec = (id: string, overrides: Partial<ExecutionState>) => {
		fs.writeFileSync(
			path.join(root, 'executions', `${id}.json`),
			JSON.stringify(
				makeExec({
					executionId: id,
					flowId: 'build_task',
					flowFile,
					flowVersion: '1.0.0',
					definitionHash: hash,
					versionChoice: 'file',
					steps: {
						plan: { status: 'completed' },
						test: { status: 'completed' },
					},
					...overrides,
				})
			)
		);
	};

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-graph-snap-'));
		fs.mkdirSync(path.join(root, 'executions'));
		flowFile = path.join(root, 'build_task.yml');
		fs.writeFileSync(flowFile, FLOW_YAML);
		service = FlowQueryService.forConfigDir(root);
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('draws the recorded definition, not the edited file: real edges and no "flow file changed" warning', () => {
		writeExec('snap0001', { definitionSnapshot: snapshot() });
		fs.writeFileSync(
			flowFile,
			'id: build_task\nversion: "2.0.0"\nname: Other\nsteps:\n  - id: only\n    name: Only\n    type: script\n    script: x\n'
		);

		const result = service.getFlowGraph({ executionId: 'snap0001' });

		expect(result.graph.nodes.map(node => node.id)).toEqual(['plan', 'test']);
		expect(
			result.graph.edges.some(edge => edge.from === 'plan' && edge.to === 'test' && edge.kind === 'dependency')
		).toBe(true);
		expect(result.graph.warnings ?? []).toEqual([]);
		expect(result).toMatchObject({
			flowName: 'Build a task',
			definition: {
				source: 'recorded',
				version: '1.0.0',
				snapshot: 'build_task/1.0.0-' + hash.slice(0, 12) + '.yml',
			},
		});
	});

	it('still works after the flow file was deleted', () => {
		writeExec('snap0002', { definitionSnapshot: snapshot() });
		fs.rmSync(flowFile);

		expect(service.getFlowGraph({ executionId: 'snap0002' }).graph.nodes).toHaveLength(2);
	});

	it('tells that the flow file is used when the record has no snapshot (old record)', () => {
		writeExec('old00002', { flowVersion: undefined, definitionHash: undefined, versionChoice: undefined });

		expect(service.getFlowGraph({ executionId: 'old00002' }).definition).toEqual({ source: 'flow-file' });
	});

	it('fails loudly when the recorded snapshot is gone instead of drawing the current file', () => {
		writeExec('snap0003', { definitionSnapshot: 'build_task/1.0.0-' + hash.slice(0, 12) + '.yml' });

		expect(() => service.getFlowGraph({ executionId: 'snap0003' })).toThrow(/Cannot read definition snapshot/);
	});
});
