import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_EXECUTION_LOG_LIMIT,
	MAX_EXECUTION_LOG_LIMIT,
	registerExecutionLogRoutes,
} from './ExecutionLogRoutes.js';

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];

const line = (stepId: string, level: string, message: string, timestamp: string, executionId = 'run1'): string =>
	JSON.stringify({ prefix: `[${executionId}|${stepId}]`, timestamp, level, message });

interface LogsBody {
	executionId: string;
	flowId: string;
	entries: { timestamp: string; level: string; stepId: string; message: string }[];
	total: number;
	limit: number;
	offset: number;
	stepOptions: { value: string; label: string }[];
	recordedOutput: string;
	hasRecordedOutput: boolean;
	notice: string;
	hasNotice: boolean;
}

const call = async (query: Record<string, string | string[]>, id = 'run1') =>
	callRoute(routes, 'GET /executions/:id/logs', { params: { id }, query });

beforeEach(() => {
	fixture = new FlowConfigFixture();
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerExecutionLogRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
	fixture.addExecution({
		executionId: 'run1',
		flowId: 'build',
		startedAt: '2026-08-16T10:00:00.000Z',
		completedAt: '2026-08-16T10:05:00.000Z',
		steps: { compile: { status: 'completed' }, test: { status: 'failed', error: 'exit 1' } },
	});
	fixture.addLog('2026-08-16', [
		line('compile', 'info', 'compiling', '2026-08-16T10:01:00.000Z'),
		line('test', 'info', 'running tests', '2026-08-16T10:02:00.000Z'),
		line('test', 'error', 'test failed', '2026-08-16T10:03:00.000Z'),
		line('__execution', 'error', 'Execution failed', '2026-08-16T10:05:00.000Z'),
		line('compile', 'info', 'someone else', '2026-08-16T10:01:30.000Z', 'run2'),
	]);
});

afterEach(() => fixture.dispose());

describe('GET /executions/:id/logs', () => {
	it('registers one route', () => {
		expect([...routes.keys()]).toEqual(['GET /executions/:id/logs']);
	});

	it('answers the lines of the run with ISO timestamps (the shell formats them), the page size and the offset', async () => {
		const { status, body } = await call({});
		const logs = body as LogsBody;
		expect(status).toBe(200);
		expect(logs).toMatchObject({
			executionId: 'run1',
			flowId: 'build',
			total: 4,
			limit: DEFAULT_EXECUTION_LOG_LIMIT,
			offset: 0,
		});
		expect(logs.entries.map(e => e.message)).toEqual([
			'compiling',
			'running tests',
			'test failed',
			'Execution failed',
		]);
		expect(logs.entries[0]).toEqual({
			timestamp: '2026-08-16T10:01:00.000Z',
			level: 'info',
			stepId: 'compile',
			message: 'compiling',
		});
	});

	it('offers the steps of the run for a step filter, the run events labelled', async () => {
		const logs = (await call({})).body as LogsBody;
		expect(logs.stepOptions).toEqual([
			{ value: 'compile', label: 'compile' },
			{ value: 'test', label: 'test' },
			{ value: '__execution', label: 'Run events (__execution)' },
		]);
	});

	it('filters by step, level and text, and treats the empty values the DSL sends for unset controls as absent', async () => {
		expect(((await call({ step: 'test' })).body as LogsBody).total).toBe(2);
		expect(((await call({ step: 'test', level: 'error' })).body as LogsBody).entries.map(e => e.message)).toEqual([
			'test failed',
		]);
		expect(((await call({ q: 'TESTS' })).body as LogsBody).entries.map(e => e.message)).toEqual(['running tests']);
		expect(((await call({ step: '', level: '', q: '', limit: '', page: '' })).body as LogsBody).total).toBe(4);
	});

	it('pages from the end: page 0 is the tail, offset says how many lines were skipped', async () => {
		const tail = (await call({ limit: '2' })).body as LogsBody;
		expect(tail.entries.map(e => e.message)).toEqual(['test failed', 'Execution failed']);
		expect(tail).toMatchObject({ total: 4, limit: 2, offset: 0 });
		const previous = (await call({ limit: '2', page: '1' })).body as LogsBody;
		expect(previous.entries.map(e => e.message)).toEqual(['compiling', 'running tests']);
		expect(previous.offset).toBe(2);
	});

	it('sends the failure text of the execution record, which outlives the daily log files', async () => {
		const logs = (await call({})).body as LogsBody;
		expect(logs.recordedOutput).toBe('[test] error: exit 1\n');
		expect(logs.hasRecordedOutput).toBe(true);
		const compileOnly = (await call({ step: 'compile' })).body as LogsBody;
		expect(compileOnly).toMatchObject({ recordedOutput: '', hasRecordedOutput: false });
	});

	it('says nothing when there is nothing to explain', async () => {
		expect(await call({})).toMatchObject({ body: { notice: '', hasNotice: false } });
	});

	it('explains an empty list: no log file in the window, with where the daemon writes them', async () => {
		fixture.addExecution({
			executionId: 'old1',
			startedAt: '2020-01-01T10:00:00.000Z',
			completedAt: '2020-01-01T10:01:00.000Z',
		});
		const logs = (await call({}, 'old1')).body as LogsBody;
		expect(logs.entries).toEqual([]);
		expect(logs.hasNotice).toBe(true);
		expect(logs.notice).toMatch(/No daemon log file covers this run/);
		expect(logs.notice).toContain(fixture.configDir);
	});

	it('explains an empty list caused by the filters, and counts the lines it could not read', async () => {
		const filtered = (await call({ q: 'zzz' })).body as LogsBody;
		expect(filtered.notice).toMatch(/No log line matches the filters/);
		fixture.addLog('2026-08-16', [
			'{ run1 [run1|x] not json',
			line('compile', 'info', 'compiling', '2026-08-16T10:01:00.000Z'),
		]);
		const damaged = (await call({})).body as LogsBody;
		expect(damaged.notice).toMatch(/1 line could not be read/);
	});

	it('resolves a unique id prefix', async () => {
		expect(((await call({}, 'run')).body as LogsBody).executionId).toBe('run1');
	});

	it.each([
		[{ level: 'warn' }, "Invalid level 'warn': expected one of debug, info, warning, error."],
		[{ limit: '0' }, `'limit' must be an integer between 1 and ${MAX_EXECUTION_LOG_LIMIT}, got '0'.`],
		[{ page: '-1' }, "'page' must be an integer >= 0, got '-1'."],
		[{ step: ['a', 'b'] }, "'step' must be given once, got 2 values."],
	])('rejects the query %j with 400 and an actionable message', async (query, message) => {
		expect(await call(query)).toEqual({ status: 400, body: { error: message } });
	});

	it('answers an unknown execution with its lookup error, not an empty page', async () => {
		const { status, body } = await call({}, 'nope');
		expect(status).toBe(404);
		expect(String((body as { error: string }).error)).toMatch(/nope/);
	});
});
