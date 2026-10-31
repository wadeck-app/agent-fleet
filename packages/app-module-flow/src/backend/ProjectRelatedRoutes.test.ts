import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService, type ProjectFinder, type ProjectFinding } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerProjectRelatedRoutes } from './ProjectRelatedRoutes.js';

const ROUTE = 'GET /related/project/:projectId';
const PROJECT = 'a1b2c3d4';

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];
let finding: ProjectFinding;

beforeEach(() => {
	fixture = new FlowConfigFixture();
	finding = { kind: 'live', name: 'shop', virtual: false };
	const finder: ProjectFinder = () => finding;
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerProjectRelatedRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir), finder);
});

afterEach(() => fixture.dispose());

function call(projectId: string) {
	return callRoute(routes, ROUTE, { params: { projectId } });
}

describe('GET /related/project/:projectId', () => {
	it('answers the contract of a project with no run: a title, a zero count, no item and the filtered page', async () => {
		expect(await call(PROJECT)).toEqual({
			status: 200,
			body: {
				title: 'Flow executions',
				count: 0,
				countLabel: 'running or queued',
				items: [],
				moreUrl: `/modules/flow/executions?project=${PROJECT}`,
				project: { name: 'shop', removed: false, virtual: false },
			},
		});
	});

	it('counts the running and waiting runs of this project only, and lists its latest runs, newest first', async () => {
		fixture.addExecution({ executionId: 'r1', flowId: 'build', status: 'running', completedAt: null, projectId: PROJECT, startedAt: '2026-10-30T10:00:00.000Z' });
		fixture.addExecution({ executionId: 'q1', flowId: 'lint', status: 'queued', completedAt: null, projectId: PROJECT, startedAt: '2026-10-30T11:00:00.000Z' });
		fixture.addExecution({ executionId: 'd1', flowId: 'deploy', status: 'completed', projectId: PROJECT, startedAt: '2026-10-30T09:00:00.000Z' });
		fixture.addExecution({ executionId: 'other', status: 'running', completedAt: null, projectId: '00000000', startedAt: '2026-10-30T12:00:00.000Z' });
		fixture.addExecution({ executionId: 'old', status: 'running', completedAt: null, startedAt: '2026-10-30T12:30:00.000Z' });

		const { status, body } = await call(PROJECT);
		expect(status).toBe(200);
		expect(body).toMatchObject({
			count: 2,
			countLabel: 'running or queued',
			items: [
				{ label: 'lint', subtitle: 'queued - 2026-10-30T11:00:00.000Z', url: '/modules/flow/executions/q1' },
				{ label: 'build', subtitle: 'running - 2026-10-30T10:00:00.000Z', url: '/modules/flow/executions/r1' },
				{ label: 'deploy', subtitle: 'completed - 2026-10-30T09:00:00.000Z', url: '/modules/flow/executions/d1' },
			],
		});
	});

	it('keeps the 10 latest runs but counts the active ones beyond them', async () => {
		for (let n = 0; n < 12; n++) {
			fixture.addExecution({ executionId: `e${String(n).padStart(2, '0')}`, status: 'running', completedAt: null, projectId: PROJECT, startedAt: `2026-10-30T10:${String(n).padStart(2, '0')}:00.000Z` });
		}
		const { body } = (await call(PROJECT)) as { body: { count: number; items: unknown[] } };
		expect(body.count).toBe(12);
		expect(body.items).toHaveLength(10);
	});

	it('percent-encodes the execution id and starts every url with /modules/', async () => {
		fixture.addExecution({ executionId: 'a b', projectId: PROJECT });
		const { body } = (await call(PROJECT)) as { body: { items: { url: string }[]; moreUrl: string } };
		expect(body.items[0]!.url).toBe('/modules/flow/executions/a%20b');
		for (const url of [...body.items.map(item => item.url), body.moreUrl]) {
			expect(url.startsWith('/modules/')).toBe(true);
		}
	});

	it.each(['', 'A1B2C3D4', 'a1b2c3', 'a1b2c3d4e', 'zzzzzzzz', '../../x'])(
		'refuses the malformed id %j with a 400 that says what an id looks like',
		async id => {
			const { status, body } = await call(id);
			expect(status).toBe(400);
			expect((body as { error: string }).error).toMatch(/8 lowercase hexadecimal/);
		}
	);

	it('answers 404 for an id the registry never had, with a message that lists no project', async () => {
		finding = { kind: 'unknown' };
		const { status, body } = await call(PROJECT);
		expect(status).toBe(404);
		expect((body as { error: string }).error).toContain(PROJECT);
		expect((body as { error: string }).error).toContain('project list');
	});

	it('answers a removed project normally, flagged removed, with its runs', async () => {
		finding = { kind: 'removed', name: 'old-shop', virtual: false };
		fixture.addExecution({ executionId: 'r1', projectId: PROJECT });
		const { status, body } = await call(PROJECT);
		expect(status).toBe(200);
		expect(body).toMatchObject({ project: { name: 'old-shop', removed: true }, countLabel: 'running or queued', items: [{ url: '/modules/flow/executions/r1' }] });
	});

	it('answers a virtual project like any other, flagged virtual', async () => {
		finding = { kind: 'live', name: 'shared', virtual: true };
		const { status, body } = await call(PROJECT);
		expect(status).toBe(200);
		expect(body).toMatchObject({ project: { name: 'shared', virtual: true } });
	});

	it('answers 502 with the registry cause and a command to run when the registry cannot be read', async () => {
		finding = { kind: 'unavailable', reason: 'the project registry in "/x" cannot be read (boom)' };
		const { status, body } = await call(PROJECT);
		expect(status).toBe(502);
		expect((body as { error: string }).error).toContain('boom');
		expect((body as { error: string }).error).toContain('project list');
	});

	it('answers an error reply, never throws, when a finder bug throws', async () => {
		const collected = collectRoutes<ModuleContext>();
		registerProjectRelatedRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir), () => {
			throw new Error('bug');
		});
		const { status } = await callRoute(collected.routes, ROUTE, { params: { projectId: PROJECT } });
		expect(status).toBe(500);
	});
});
