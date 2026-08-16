import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ExecutionRecord, buildHistoryTable, loadExecutions } from './HistoryCommand';

function makeExec(partial: Partial<ExecutionRecord> & { executionId: string }): ExecutionRecord {
	return {
		flowId: 'test-flow',
		flowFile: '/tmp/test-flow.yml',
		status: 'completed',
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		steps: {},
		...partial,
	};
}

describe('loadExecutions', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns empty array when dir does not exist', () => {
		expect(loadExecutions('/nonexistent/dir')).toEqual([]);
	});

	it('returns empty array when dir has no json files', () => {
		expect(loadExecutions(tmpDir)).toEqual([]);
	});

	it('loads and parses execution files', () => {
		const exec = makeExec({ executionId: 'abc123' });
		fs.writeFileSync(path.join(tmpDir, 'abc123.json'), JSON.stringify(exec));
		const result = loadExecutions(tmpDir);
		expect(result).toHaveLength(1);
		expect(result[0]!.executionId).toBe('abc123');
	});

	it('sorts by startedAt descending (newest first)', () => {
		fs.writeFileSync(
			path.join(tmpDir, 'old.json'),
			JSON.stringify(makeExec({ executionId: 'old', startedAt: '2026-08-15T10:00:00.000Z' }))
		);
		fs.writeFileSync(
			path.join(tmpDir, 'new.json'),
			JSON.stringify(makeExec({ executionId: 'new', startedAt: '2026-08-16T10:00:00.000Z' }))
		);
		const result = loadExecutions(tmpDir);
		expect(result[0]!.executionId).toBe('new');
		expect(result[1]!.executionId).toBe('old');
	});

	it('skips malformed json files', () => {
		fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not-json');
		fs.writeFileSync(path.join(tmpDir, 'good.json'), JSON.stringify(makeExec({ executionId: 'good' })));
		expect(loadExecutions(tmpDir)).toHaveLength(1);
	});
});

describe('buildHistoryTable', () => {
	const execs: ExecutionRecord[] = [
		makeExec({
			executionId: 'aaa',
			flowId: 'task-retry',
			status: 'completed',
			startedAt: '2026-08-16T12:00:00.000Z',
			completedAt: '2026-08-16T12:00:01.244Z',
		}),
		makeExec({
			executionId: 'bbb',
			flowId: 'task-loop',
			status: 'failed',
			startedAt: '2026-08-16T11:00:00.000Z',
			completedAt: '2026-08-16T11:00:05.000Z',
		}),
		makeExec({
			executionId: 'ccc',
			flowId: 'task-retry',
			status: 'completed',
			startedAt: '2026-08-16T10:00:00.000Z',
			completedAt: '2026-08-16T10:00:02.000Z',
		}),
	];

	it('returns "No executions found" for empty list', () => {
		expect(buildHistoryTable([], {})).toBe('No executions found.');
	});

	it('renders header + rows', () => {
		const out = buildHistoryTable(execs, {});
		expect(out).toContain('EXECUTION');
		expect(out).toContain('aaa');
		expect(out).toContain('task-retry');
		expect(out).toContain('completed');
	});

	it('respects --limit', () => {
		const out = buildHistoryTable(execs, { limit: 1 });
		expect(out).toContain('aaa');
		expect(out).not.toContain('bbb');
	});

	it('filters by --status', () => {
		const out = buildHistoryTable(execs, { status: 'failed' });
		expect(out).toContain('bbb');
		expect(out).not.toContain('aaa');
	});

	it('filters by --flow', () => {
		const out = buildHistoryTable(execs, { flow: 'task-loop' });
		expect(out).toContain('bbb');
		expect(out).not.toContain('aaa');
	});

	it('returns "No executions found" when filter matches nothing', () => {
		const out = buildHistoryTable(execs, { status: 'running' });
		expect(out).toBe('No executions found.');
	});
});

describe('buildHistoryTable --id detail view', () => {
	const exec = makeExec({
		executionId: 'abc',
		flowId: 'task-retry',
		steps: {
			'step-a': {
				status: 'completed',
				startedAt: '2026-08-16T12:00:00.000Z',
				completedAt: '2026-08-16T12:00:01.000Z',
			},
			'step-b': {
				status: 'failed',
				startedAt: '2026-08-16T12:00:01.000Z',
				completedAt: '2026-08-16T12:00:02.000Z',
			},
		},
	});

	it('shows step detail when id matches', () => {
		const out = buildHistoryTable([exec], { id: 'abc' });
		expect(out).toContain('step-a');
		expect(out).toContain('step-b');
		expect(out).toContain('completed');
		expect(out).toContain('failed');
	});

	it('shows "Execution not found" for unknown id', () => {
		const out = buildHistoryTable([exec], { id: 'zzz' });
		expect(out).toContain('not found');
	});

	it('marks injected steps with * in detail view', () => {
		const execWithInjected = makeExec({
			executionId: 'inj',
			steps: {
				'static-step': { status: 'completed' },
				'dynamic-step': { status: 'completed', injected: true },
			},
		});
		const out = buildHistoryTable([execWithInjected], { id: 'inj' });
		expect(out).toContain('dynamic-step*');
		expect(out).not.toContain('static-step*');
	});
});
