import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_ERROR_EXCERPT_LENGTH } from './ExecutionDisplay.js';
import { registerExecutionRoutes } from './ExecutionRoutes.js';

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];

beforeEach(() => {
	fixture = new FlowConfigFixture();
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerExecutionRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
});

afterEach(() => fixture.dispose());

describe('GET /executions', () => {
	it('registers the list and the detail routes', () => {
		expect([...routes.keys()].sort()).toEqual(['GET /executions', 'GET /executions/:id', 'GET /flows']);
	});

	it('answers an empty page, not an error, when nothing ran yet', async () => {
		expect(await callRoute(routes, 'GET /executions', { query: {} })).toEqual({
			status: 200,
			body: {
				items: [],
				total: 0,
				skipped: 0,
				limit: 20,
				offset: 0,
				emptyMessage: 'No execution yet: run a flow and it shows here',
			},
		});
	});

	it('counts the execution files it could not read, so a client can say the list is incomplete', async () => {
		fixture.addExecution({ executionId: 'good1' });
		fixture.addRawExecutionFile('broken1', '{ not json');
		fixture.addRawExecutionFile('broken2', JSON.stringify({ executionId: 'broken2' }));
		const { status, body } = await callRoute(routes, 'GET /executions', { query: {} });
		expect(status).toBe(200);
		expect(body).toMatchObject({ total: 1, skipped: 2 });
	});

	it('lists summaries newest first with the pagination that was applied', async () => {
		fixture.addExecution({ executionId: 'old1', startedAt: '2026-08-15T10:00:00.000Z' });
		fixture.addExecution({
			executionId: 'new1',
			startedAt: '2026-08-16T10:00:00.000Z',
			steps: { a: { status: 'failed' } },
		});
		const { status, body } = await callRoute(routes, 'GET /executions', { query: {} });
		const page = body as { items: { executionId: string; failedStepCount: number }[]; total: number };
		expect(status).toBe(200);
		expect(page.items.map(i => i.executionId)).toEqual(['new1', 'old1']);
		expect(page.items[0]!.failedStepCount).toBe(1);
		expect(page.items[0]).not.toHaveProperty('steps');
		expect(page.total).toBe(2);
	});

	it('filters by status and flow, and paginates with limit/offset', async () => {
		fixture.addExecution({ executionId: 'a1', status: 'failed', startedAt: '2026-08-16T10:00:03.000Z' });
		fixture.addExecution({ executionId: 'a2', status: 'failed', startedAt: '2026-08-16T10:00:02.000Z' });
		fixture.addExecution({
			executionId: 'b1',
			status: 'failed',
			flowId: 'other',
			startedAt: '2026-08-16T10:00:01.000Z',
		});
		fixture.addExecution({ executionId: 'c1', status: 'completed', startedAt: '2026-08-16T10:00:00.000Z' });

		const failedDeploys = await callRoute(routes, 'GET /executions', {
			query: { status: 'failed', flow: 'deploy' },
		});
		expect((failedDeploys.body as { items: { executionId: string }[] }).items.map(i => i.executionId)).toEqual([
			'a1',
			'a2',
		]);

		const second = await callRoute(routes, 'GET /executions', {
			query: { status: 'failed', limit: '1', offset: '1' },
		});
		expect(second.body).toMatchObject({ total: 3, limit: 1, offset: 1 });
		expect((second.body as { items: { executionId: string }[] }).items.map(i => i.executionId)).toEqual(['a2']);
	});

	it('paginates by page (zero-based, what the DSL Pagination component sends): offset = page * limit', async () => {
		for (const n of [1, 2, 3, 4, 5]) {
			fixture.addExecution({ executionId: `e${n}`, startedAt: `2026-08-16T10:00:0${n}.000Z` });
		}
		const { body } = await callRoute(routes, 'GET /executions', { query: { page: '1', limit: '2' } });
		expect(body).toMatchObject({ total: 5, limit: 2, offset: 2 });
		expect((body as { items: { executionId: string }[] }).items.map(i => i.executionId)).toEqual(['e3', 'e2']);
	});

	it('rejects page combined with offset (two ways to say the same thing)', async () => {
		expect(await callRoute(routes, 'GET /executions', { query: { page: '1', offset: '2' } })).toEqual({
			status: 400,
			body: { error: "'page' and 'offset' cannot be combined: use page (with limit) or offset, not both." },
		});
	});

	it('rejects a page whose offset overflows', async () => {
		const { status } = await callRoute(routes, 'GET /executions', {
			query: { page: '9007199254740991', limit: '500' },
		});
		expect(status).toBe(400);
	});

	it('treats the empty filters the DSL sends for unset controls as absent', async () => {
		fixture.addExecution({ executionId: 'a1' });
		const { body } = await callRoute(routes, 'GET /executions', {
			query: { status: '', flow: '', limit: '', offset: '' },
		});
		expect((body as { total: number }).total).toBe(1);
	});

	it('searches the flow name by substring with flowContains (the flow box of the page), and keeps flow as an exact match', async () => {
		fixture.addExecution({ executionId: 'a1', flowId: 'deploy' });
		fixture.addExecution({ executionId: 'a2', flowId: 'Deploy-Prod' });
		fixture.addExecution({ executionId: 'a3', flowId: 'build' });
		const ids = async (query: Record<string, string>) =>
			((await callRoute(routes, 'GET /executions', { query })).body as { items: { executionId: string }[] }).items
				.map(i => i.executionId)
				.sort();
		expect(await ids({ flowContains: 'deploy' })).toEqual(['a1', 'a2']);
		expect(await ids({ flow: 'deploy' })).toEqual(['a1']);
	});

	it('filters the runs that recovered from an error with status=recovered', async () => {
		fixture.addExecution({ executionId: 'r1', lastError: 'flaky' });
		fixture.addExecution({ executionId: 'r2' });
		const { body } = await callRoute(routes, 'GET /executions', { query: { status: 'recovered' } });
		expect((body as { items: { executionId: string }[] }).items.map(i => i.executionId)).toEqual(['r1']);
	});

	it('words the empty table: a page past the end, a filter without match, and nothing ever ran', async () => {
		const emptyMessage = async (query: Record<string, string>) =>
			((await callRoute(routes, 'GET /executions', { query })).body as { emptyMessage: string }).emptyMessage;
		expect(await emptyMessage({})).toBe('No execution yet: run a flow and it shows here');
		fixture.addExecution({ executionId: 'a1', flowId: 'deploy' });
		expect(await emptyMessage({ page: '5' })).toBe('No executions on this page');
		expect(await emptyMessage({ flowContains: 'nothing' })).toBe('No execution matches the filters');
		expect(await emptyMessage({ status: 'failed' })).toBe('No execution matches the filters');
	});

	it('looks an id prefix up (a lookup, not a page)', async () => {
		fixture.addExecution({ executionId: 'abcd1' });
		fixture.addExecution({ executionId: 'zzzz9' });
		const { body } = await callRoute(routes, 'GET /executions', { query: { id: 'abc' } });
		expect((body as { items: { executionId: string }[] }).items.map(i => i.executionId)).toEqual(['abcd1']);
	});

	it.each([
		[{ limit: '0' }, "'limit' must be an integer between 1 and 500, got '0'."],
		[{ limit: '501' }, "'limit' must be an integer between 1 and 500, got '501'."],
		[{ offset: '-1' }, "'offset' must be an integer >= 0, got '-1'."],
		[
			{ status: 'exploded' },
			"'status' must be one of queued, running, completed, failed, re-queued, recovered, got 'exploded'.",
		],
		[{ flow: ['a', 'b'] }, "'flow' must be given once, got 2 values."],
		[{ flowContains: ['a', 'b'] }, "'flowContains' must be given once, got 2 values."],
	])('rejects the query %j with 400 and an actionable message', async (query, message) => {
		expect(await callRoute(routes, 'GET /executions', { query })).toEqual({
			status: 400,
			body: { error: message },
		});
	});
});

describe('GET /executions/:id', () => {
	it('returns the execution with its steps and the rendered text', async () => {
		fixture.addExecution({
			executionId: 'abc123',
			status: 'failed',
			lastError: 'exit 1',
			steps: {
				build: {
					status: 'failed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:01.000Z',
					error: 'exit 1',
					stdout: 'x'.repeat(50),
				},
			},
		});
		const { status, body } = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'abc123' },
			query: {},
		});
		const detail = body as { executionId: string; steps: { stepId: string }[]; text: string };
		expect(status).toBe(200);
		expect(detail.executionId).toBe('abc123');
		expect(detail.steps.map(s => s.stepId)).toEqual(['build']);
		expect(detail.text).toContain('Execution: abc123');
		expect(detail.text).toContain('x'.repeat(50));
	});

	it('resolves a unique id prefix', async () => {
		fixture.addExecution({ executionId: 'abc123' });
		const { status, body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc' }, query: {} });
		expect(status).toBe(200);
		expect((body as { executionId: string }).executionId).toBe('abc123');
	});

	it('tails failed step output to `tail` characters, and `full=true` lifts the limit', async () => {
		fixture.addExecution({
			executionId: 'abc123',
			status: 'failed',
			steps: { s: { status: 'failed', stdout: `HEAD${'m'.repeat(300)}TAIL` } },
		});
		const tailed = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'abc123' },
			query: { tail: '10' },
		});
		expect((tailed.body as { text: string }).text).not.toContain('HEAD');
		expect((tailed.body as { text: string }).text).toContain('TAIL');
		const full = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'abc123' },
			query: { tail: '10', full: 'true' },
		});
		expect((full.body as { text: string }).text).toContain('HEAD');
	});

	it.each([
		['Not_An_Id', 400],
		['nomatch', 404],
	])('maps the lookup error for %s to %i', async (id, status) => {
		const reply = await callRoute(routes, 'GET /executions/:id', { params: { id }, query: {} });
		expect(reply.status).toBe(status);
		expect((reply.body as { error: string }).error).toContain(id);
	});

	it('answers 409 naming the candidates for an ambiguous prefix', async () => {
		fixture.addExecution({ executionId: 'abc111' });
		fixture.addExecution({ executionId: 'abc222' });
		const { status, body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc' }, query: {} });
		expect(status).toBe(409);
		expect((body as { error: string }).error).toContain('abc111, abc222');
	});

	it('answers 422 for a corrupt file and for a file that is not an execution record', async () => {
		fixture.addRawExecutionFile('bad001', '{not json');
		fixture.addRawExecutionFile('bad002', '{"executionId":"bad002"}');
		expect((await callRoute(routes, 'GET /executions/:id', { params: { id: 'bad001' }, query: {} })).status).toBe(
			422
		);
		expect((await callRoute(routes, 'GET /executions/:id', { params: { id: 'bad002' }, query: {} })).status).toBe(
			422
		);
	});

	it('rejects a malformed tail or full with 400', async () => {
		fixture.addExecution({ executionId: 'abc123' });
		const tail = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'abc123' },
			query: { tail: 'lots' },
		});
		expect(tail.status).toBe(400);
		const full = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'abc123' },
			query: { full: 'maybe' },
		});
		expect(full).toEqual({ status: 400, body: { error: "'full' must be 'true' or 'false', got 'maybe'." } });
	});
});

describe('GET /flows', () => {
	it('answers an empty list when nothing ran yet', async () => {
		expect(await callRoute(routes, 'GET /flows', { query: {} })).toEqual({
			status: 200,
			body: { flows: [], total: 0, caption: 'No flow has run yet' },
		});
	});

	it('lists each flow that ran once, with counts, most recent first', async () => {
		fixture.addExecution({
			executionId: 'a1',
			flowId: 'deploy',
			status: 'failed',
			startedAt: '2026-08-16T10:00:00.000Z',
		});
		fixture.addExecution({ executionId: 'a2', flowId: 'deploy', startedAt: '2026-08-15T10:00:00.000Z' });
		fixture.addExecution({ executionId: 'b1', flowId: 'build', startedAt: '2026-08-17T10:00:00.000Z' });
		const { status, body } = await callRoute(routes, 'GET /flows', { query: {} });
		expect(status).toBe(200);
		// The shell formats lastStartedAt (DataTable format: datetime): no server-side label next to it.
		expect(JSON.stringify(body)).not.toContain('lastStartedLabel');
		expect(body).toMatchObject({
			flows: [
				{
					flowId: 'build',
					executionCount: 1,
					failedCount: 0,
					lastStartedAt: '2026-08-17T10:00:00.000Z',
				},
				{
					flowId: 'deploy',
					executionCount: 2,
					failedCount: 1,
					lastStartedAt: '2026-08-16T10:00:00.000Z',
				},
			],
			total: 2,
			caption: '2 flows, most recent first. Click one to see only its executions.',
		});
	});

	it('limits the list to the most recent flows and says how many exist', async () => {
		for (const [index, flowId] of ['a', 'b', 'c'].entries()) {
			fixture.addExecution({ executionId: `x${index}`, flowId, startedAt: `2026-08-1${index}T10:00:00.000Z` });
		}
		const { body } = await callRoute(routes, 'GET /flows', { query: { limit: '2' } });
		const page = body as { flows: { flowId: string }[]; total: number; caption: string };
		expect(page.flows.map(flow => flow.flowId)).toEqual(['c', 'b']);
		expect(page.total).toBe(3);
		expect(page.caption).toBe(
			'2 most recent of 3 flows. Click one to see only its executions, or open ?flow=<flowId>.'
		);
	});

	it('rejects a bad limit with 400', async () => {
		expect(await callRoute(routes, 'GET /flows', { query: { limit: '0' } })).toEqual({
			status: 400,
			body: { error: "'limit' must be an integer between 1 and 500, got '0'." },
		});
	});
});

describe('display fields (the DataTable shows a cell as is: it cannot style, truncate or format)', () => {
	it('sends the full flow name and execution id (the column truncates), a short statusLabel and the links of the run, keeping the raw fields', async () => {
		fixture.addExecution({
			executionId: 'bad1',
			status: 'failed',
			startedAt: '2026-08-16T10:05:09.000Z',
			lastError: `first line
${'word '.repeat(40)}`,
		});
		fixture.addExecution({ executionId: 'ok1', startedAt: '2026-08-15T10:00:00.000Z' });
		const { body } = await callRoute(routes, 'GET /executions', { query: {} });
		const [bad, ok] = (body as { items: Record<string, unknown>[] }).items;
		expect(bad).toMatchObject({
			status: 'failed',
			startedAt: '2026-08-16T10:05:09.000Z',
			flowId: 'deploy',
			executionId: 'bad1',
			statusLabel: 'FAILED',
			logsHref: '/modules/flow/executions/bad1/logs',
		});
		expect(bad).not.toHaveProperty('runLabel');
		// The shell formats the ISO startedAt itself (DataTable format: datetime): no server-side label.
		expect(bad).not.toHaveProperty('startedLabel');
		expect(String(bad!['errorExcerpt'])).toHaveLength(MAX_ERROR_EXCERPT_LENGTH);
		expect(String(bad!['errorExcerpt'])).toMatch(/^first line word word .*...$/);
		expect(bad!['lastError']).toContain('\n');
		expect(ok).toMatchObject({ status: 'completed', statusLabel: 'ok', errorExcerpt: '' });
	});

	it('never cuts a long flow name: the column truncates it with an ellipsis when the viewport needs it', async () => {
		const flowId = 'a_very_long_flow_name_'.repeat(5);
		fixture.addExecution({ executionId: 'long1', flowId });
		const { body } = await callRoute(routes, 'GET /executions', { query: {} });
		expect((body as { items: { flowId: string }[] }).items[0]!.flowId).toBe(flowId);
	});

	it('labels the error of a completed run as recovered, in the status and in the excerpt', async () => {
		fixture.addExecution({ executionId: 'rec1', lastError: 'worker lost the connection and was retried' });
		const { body } = await callRoute(routes, 'GET /executions', { query: {} });
		const [row] = (body as { items: Record<string, unknown>[] }).items;
		expect(row).toMatchObject({ status: 'completed', statusLabel: 'ok, recovered' });
		expect(String(row!['errorExcerpt'])).toMatch(/^recovered: worker/);
		expect(String(row!['errorExcerpt']).length).toBeLessThanOrEqual(MAX_ERROR_EXCERPT_LENGTH);
	});

	it('sends the path of the logs page of the run with the detail', async () => {
		fixture.addExecution({ executionId: 'det1' });
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'det1' } });
		expect(body).toMatchObject({ logsHref: '/modules/flow/executions/det1/logs' });
	});

	it('summarises the detail for stat tiles: steps, retries and the error', async () => {
		fixture.addExecution({
			executionId: 'sum1',
			status: 'failed',
			lastError: 'e'.repeat(80),
			steps: {
				build: { status: 'completed' },
				flaky: { status: 'completed', error: 'boom', attempts: 3 },
				test: { status: 'failed', error: 'e'.repeat(80), attempts: 2 },
				ship: { status: 'pending' },
			},
		});
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'sum1' }, query: {} });
		const detail = body as { stepsSummary: string; retryCount: number; errorSummary: string };
		expect(detail).toMatchObject({ stepsSummary: '4 steps, 1 failed', retryCount: 3 });
		expect(detail.errorSummary).toHaveLength(MAX_ERROR_EXCERPT_LENGTH);
	});

	it('says there is no error, and counts a single step as a step, when the run is clean', async () => {
		fixture.addExecution({ executionId: 'sum2', steps: { build: { status: 'completed' } } });
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'sum2' }, query: {} });
		expect(body).toMatchObject({ stepsSummary: '1 step, 0 failed', retryCount: 0, errorSummary: 'none' });
	});

	it('labels every step with a short status word, and notes retries and recovered errors', async () => {
		fixture.addExecution({
			executionId: 'abc124',
			steps: {
				build: { status: 'completed' },
				flaky: { status: 'completed', error: 'boom', attempts: 3 },
				test: { status: 'failed', error: 'e'.repeat(80) },
				ship: { status: 'pending' },
			},
		});
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc124' }, query: {} });
		const steps = (body as { steps: { statusLabel: string; errorExcerpt: string }[] }).steps;
		expect(steps.map(step => step.statusLabel)).toEqual(['ok', 'ok, recovered, 3 tries', 'FAILED', 'pending']);
		expect(steps[1]!.errorExcerpt).toBe('recovered: boom');
		expect(steps[2]!.errorExcerpt).toHaveLength(MAX_ERROR_EXCERPT_LENGTH);
	});

	it('sends the start and end of the run as ISO timestamps in a one-row table, for the shell to format', async () => {
		fixture.addExecution({
			executionId: 'tm1',
			startedAt: '2026-08-16T10:05:09.000Z',
			completedAt: '2026-08-16T10:06:09.000Z',
		});
		fixture.addExecution({
			executionId: 'tm2',
			status: 'running',
			startedAt: '2026-08-16T10:05:09.000Z',
			completedAt: null,
		});
		const done = await callRoute(routes, 'GET /executions/:id', { params: { id: 'tm1' }, query: {} });
		expect(done.body).toMatchObject({
			timing: [{ startedAt: '2026-08-16T10:05:09.000Z', completedAt: '2026-08-16T10:06:09.000Z' }],
		});
		// A run in progress has no end: the cell stays empty, not "Invalid Date".
		const running = await callRoute(routes, 'GET /executions/:id', { params: { id: 'tm2' }, query: {} });
		expect(running.body).toMatchObject({ timing: [{ startedAt: '2026-08-16T10:05:09.000Z', completedAt: null }] });
	});

	it('words the detail status badge so a recovered error is visible, in warning colour', async () => {
		fixture.addExecution({ executionId: 'rec2', lastError: 'boom' });
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'rec2' }, query: {} });
		expect(body).toMatchObject({ statusText: 'completed, recovered an error', statusVariant: 'warning' });
	});

	it('words the detail status badge with the plain status otherwise', async () => {
		fixture.addExecution({ executionId: 'plain', status: 'failed', lastError: 'boom' });
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'plain' }, query: {} });
		expect(body).toMatchObject({ statusText: 'failed', statusVariant: 'danger' });
	});

	it('adds statusVariant and per-step display fields to the detail', async () => {
		fixture.addExecution({
			executionId: 'abc123',
			status: 'failed',
			steps: {
				build: { status: 'completed' },
				test: { status: 'failed', error: 'e'.repeat(300) },
				ship: { status: 'pending' },
			},
		});
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc123' }, query: {} });
		const detail = body as { statusLabel: string; statusVariant: string; steps: Record<string, unknown>[] };
		expect(detail).toMatchObject({ status: 'failed', statusVariant: 'danger' });
		expect(detail.steps[0]).toMatchObject({ status: 'completed', errorExcerpt: '' });
		expect(String(detail.steps[1]!['errorExcerpt'])).toHaveLength(MAX_ERROR_EXCERPT_LENGTH);
		expect(detail.steps[1]!['error']).toHaveLength(300);
		expect(detail.steps[2]).toMatchObject({ status: 'pending', errorExcerpt: '' });
	});

	it.each([
		['completed', 'success'],
		['failed', 'danger'],
		['running', 'info'],
		['queued', 'warning'],
		['re-queued', 'warning'],
	])('colours a %s run %s in the detail header', async (status, variant) => {
		fixture.addExecution({ executionId: 'abc123', status: status as 'completed' });
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc123' }, query: {} });
		expect(body).toMatchObject({ statusVariant: variant });
	});
});
