import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
	entries: {
		timestamp: string;
		level: string;
		stepId: string;
		message: string;
		preview: string;
		expandable: boolean;
		markdown: string;
		stepOrder: number | null;
		stepDepth: number;
		attempt: number;
		attempts: number;
		offsetMs: number;
		deltaMs: number | null;
	}[];
	steps: { stepId: string; label: string; order: number | null; depth: number; lineCount: number; status: string }[];
	runDurationMs: number;
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
	// The definition the run used: the nesting of sub-steps is read from it.
	const flowFile = join(fixture.configDir, 'build.yml');
	writeFileSync(
		flowFile,
		[
			'id: build',
			"version: '1.0.0'",
			'name: build',
			'steps:',
			'  - id: compile',
			'    type: script',
			'    script: echo',
		].join(String.fromCharCode(10))
	);
	fixture.addExecution({
		executionId: 'run1',
		flowId: 'build',
		flowFile,
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
			preview: 'compiling',
			expandable: false,
			markdown: '',
			stepOrder: null,
			subjectStepId: null,
			stepDepth: 0,
			attempt: 0,
			attempts: 0,
			offsetMs: 60000,
			deltaMs: null,
		});
		expect(logs.runDurationMs).toBe(300000);
		expect(logs.entries[1]).toMatchObject({ offsetMs: 120000, deltaMs: 60000 });
	});

	it('tells which step each line belongs to: rows of the steps with their line counts, and the attempt of a retried step', async () => {
		fixture.addExecution({
			executionId: 'run3',
			flowId: 'build',
			startedAt: '2026-08-17T10:00:00.000Z',
			completedAt: '2026-08-17T10:05:00.000Z',
			steps: {
				plan: {
					status: 'completed',
					startedAt: '2026-08-17T10:00:10.000Z',
					completedAt: '2026-08-17T10:01:00.000Z',
				},
				work: {
					status: 'failed',
					startedAt: '2026-08-17T10:00:20.000Z',
					completedAt: '2026-08-17T10:03:00.000Z',
					attempts: 2,
					parent: 'plan',
				},
			},
		});
		fixture.addLog('2026-08-17', [
			line('__execution', 'info', 'Step work started executing', '2026-08-17T10:00:20.000Z', 'run3'),
			line('work', 'info', 'first try', '2026-08-17T10:00:30.000Z', 'run3'),
			line('__execution', 'info', 'Step work started executing', '2026-08-17T10:01:30.000Z', 'run3'),
			line('work', 'info', 'second try', '2026-08-17T10:02:00.000Z', 'run3'),
			line('plan', 'info', 'planning', '2026-08-17T10:00:40.000Z', 'run3'),
		]);
		const logs = (await call({ step: 'work' }, 'run3')).body as LogsBody;
		expect(logs.entries.map(e => [e.message, e.stepOrder, e.stepDepth, e.attempt, e.attempts])).toEqual([
			['first try', 2, 1, 1, 2],
			['second try', 2, 1, 2, 2],
		]);
		expect(logs.steps.map(s => [s.stepId, s.order, s.depth, s.lineCount])).toEqual([
			['__execution', null, 0, 2],
			['plan', 1, 0, 1],
			['work', 2, 1, 2],
		]);
		expect(logs.steps[0]!.label).toBe('Run events');
	});

	it('gives a rendered prompt a one-line preview and the markdown its expansion panel shows', async () => {
		fixture.addLog('2026-08-16', [
			line('compile', 'info', '[rendered prompt]\n# Plan\n\n- first', '2026-08-16T10:01:10.000Z'),
		]);
		const logs = (await call({ q: 'rendered prompt' })).body as LogsBody;
		expect(logs.entries).toHaveLength(1);
		expect(logs.entries[0]).toMatchObject({
			message: '[rendered prompt]\n# Plan\n\n- first',
			preview: '[rendered prompt] # Plan - first',
			expandable: true,
			markdown: '[rendered prompt]\n# Plan\n\n- first',
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

	it('explains that sub-steps are not nested when the flow definition of the run cannot be read', async () => {
		fixture.addExecution({
			executionId: 'lost1',
			flowFile: join(fixture.configDir, 'gone.yml'),
			steps: { a: { status: 'completed' } },
		});
		const logs = (await call({}, 'lost1')).body as LogsBody;
		expect(logs.notice).toMatch(/Sub-steps are not nested.*gone.yml/);
		expect(logs.hasNotice).toBe(true);
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
