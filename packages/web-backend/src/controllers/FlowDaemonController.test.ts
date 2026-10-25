import { BUILTIN_PLUGIN_CATALOG, FlowQueryService } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FLOW_DAEMON_API_ROUTES } from '@app/shared/api/flow-daemon.contract';
import { HttpException } from '@app/shared/exceptions/http-exceptions';

import FlowDaemonController from './FlowDaemonController';

type Handler = (validated: { params?: unknown; query?: unknown }) => Promise<unknown>;
type RouteKey = keyof typeof FLOW_DAEMON_API_ROUTES & `/api/${string}`;

/** Zod-validates input and output exactly as lazy-controller-plugin does, so contract bugs surface here. */
function mount(service: FlowQueryService) {
	const handlers = new Map<string, Handler>();
	new FlowDaemonController(service).configureRoutes(((method: string, route: string, handler: Handler) => {
		handlers.set(`${method} ${route}`, handler);
	}) as never);

	return async (route: RouteKey, input: { params?: Record<string, string>; query?: Record<string, string> } = {}) => {
		const contract = (FLOW_DAEMON_API_ROUTES[route] as { GET: Record<string, { parse(v: unknown): unknown }> }).GET;
		const handler = handlers.get(`GET ${route}`);
		if (!handler) throw new Error(`Controller registered no handler for GET ${route}`);
		const validated = {
			params: contract.params ? contract.params.parse(input.params ?? {}) : {},
			query: contract.query ? contract.query.parse(input.query ?? {}) : {},
		};
		return contract.response!.parse(await handler(validated)) as Record<string, any>;
	};
}

function writeExecution(dir: string, record: Record<string, unknown>) {
	fs.mkdirSync(path.join(dir, 'executions'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'executions', `${String(record.executionId)}.json`), JSON.stringify(record));
}

function execution(id: string, extra: Record<string, unknown> = {}) {
	return {
		executionId: id,
		flowId: 'deploy',
		flowFile: '/flows/deploy.yml',
		status: 'completed',
		currentSteps: [],
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:01:00.000Z',
		steps: {},
		...extra,
	};
}

describe('FlowDaemonController', () => {
	let configDir: string;
	let get: ReturnType<typeof mount>;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-controller-'));
		get = mount(FlowQueryService.forConfigDir(configDir, BUILTIN_PLUGIN_CATALOG));
	});
	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	describe('executions', () => {
		beforeEach(() => {
			writeExecution(
				configDir,
				execution('aaa111', { startedAt: '2026-08-16T10:00:00.000Z', status: 'failed', lastError: 'boom' })
			);
			writeExecution(configDir, execution('bbb222', { startedAt: '2026-08-16T11:00:00.000Z', flowId: 'other' }));
			writeExecution(configDir, execution('ccc333', { startedAt: '2026-08-16T12:00:00.000Z' }));
		});

		it('lists newest first with the total', async () => {
			const body = await get('/api/flow-daemon/executions');
			expect(body.items.map((e: { executionId: string }) => e.executionId)).toEqual([
				'ccc333',
				'bbb222',
				'aaa111',
			]);
			expect(body).toMatchObject({ total: 3, limit: 20, offset: 0 });
		});

		it('filters by flow and status, treating empty values as unset', async () => {
			expect((await get('/api/flow-daemon/executions', { query: { flow: 'other', status: '' } })).total).toBe(1);
			const failed = await get('/api/flow-daemon/executions', { query: { status: 'failed', flow: '' } });
			expect(failed.items[0]).toMatchObject({
				executionId: 'aaa111',
				lastError: 'boom',
				lastErrorRecovered: false,
			});
		});

		it('converts a zero-based page into an offset using the limit', async () => {
			const body = await get('/api/flow-daemon/executions', { query: { limit: '2', page: '1' } });
			expect(body.items.map((e: { executionId: string }) => e.executionId)).toEqual(['aaa111']);
			expect(body).toMatchObject({ limit: 2, offset: 2, total: 3 });
		});

		it.each([
			[{ limit: '0' }],
			[{ limit: '501' }],
			[{ limit: '1e2' }],
			[{ offset: '-1' }],
			[{ status: 'paused' }],
			[{ page: '1', offset: '1' }],
		])('rejects %j with a validation error', async query => {
			await expect(get('/api/flow-daemon/executions', { query })).rejects.toThrow();
		});

		it('lists the distinct flows that ran', async () => {
			const body = await get('/api/flow-daemon/flows');
			expect(body.flows.map((f: { flowId: string }) => f.flowId).sort()).toEqual(['deploy', 'other']);
		});
	});

	describe('execution detail', () => {
		it('exposes step errors but never step meta', async () => {
			writeExecution(
				configDir,
				execution('abc123', {
					status: 'failed',
					steps: {
						build: {
							status: 'failed',
							startedAt: '2026-08-16T12:00:00.000Z',
							completedAt: '2026-08-16T12:00:02.000Z',
							error: 'exit 1',
							stderr: 'compile error',
							meta: { sessionId: 'secret-session', model: 'm1', cost: { usd: 0.5 } },
						},
					},
				})
			);
			const body = await get('/api/flow-daemon/executions/:id', { params: { id: 'abc' } });
			expect(body.steps).toHaveLength(1);
			expect(body.steps[0]).toMatchObject({ stepId: 'build', error: 'exit 1', model: 'm1', costUsd: 0.5 });
			expect(body.text).toContain('compile error');
			expect(JSON.stringify(body)).not.toContain('secret-session');
		});

		it('reports an unknown id as a 404 that says what to do', async () => {
			const error = await get('/api/flow-daemon/executions/:id', { params: { id: 'zzz999' } }).catch(e => e);
			expect(error).toBeInstanceOf(HttpException);
			expect(error.statusCode).toBe(404);
			expect(error.message).toMatch(/zzz999/);
		});

		it('reports an invalid id as a 400', async () => {
			const error = await get('/api/flow-daemon/executions/:id', { params: { id: 'NOT_VALID!' } }).catch(e => e);
			expect(error.statusCode).toBe(400);
		});

		it('reports an ambiguous prefix as a 409', async () => {
			writeExecution(configDir, execution('abc111'));
			writeExecution(configDir, execution('abc222'));
			const error = await get('/api/flow-daemon/executions/:id', { params: { id: 'abc' } }).catch(e => e);
			expect(error.statusCode).toBe(409);
		});

		it('reports a corrupt record as a 422', async () => {
			fs.mkdirSync(path.join(configDir, 'executions'), { recursive: true });
			fs.writeFileSync(path.join(configDir, 'executions', 'bad999.json'), '{not json');
			const error = await get('/api/flow-daemon/executions/:id', { params: { id: 'bad999' } }).catch(e => e);
			expect(error.statusCode).toBe(422);
		});
	});

	describe('logs', () => {
		it('says the log does not exist for a day without one', async () => {
			const body = await get('/api/flow-daemon/logs', { query: { date: '2026-01-01' } });
			expect(body).toMatchObject({ exists: false, text: '' });
		});

		it('returns the last lines of a day, formatted when asked', async () => {
			fs.mkdirSync(path.join(configDir, 'logs'), { recursive: true });
			const lines = ['one', 'two', 'three'].map(message =>
				JSON.stringify({ ts: '2026-08-16T12:00:00.000Z', level: 'info', msg: message })
			);
			fs.writeFileSync(path.join(configDir, 'logs', '2026-08-16.ndjson'), `${lines.join('\n')}\n`);
			const raw = await get('/api/flow-daemon/logs', { query: { date: '2026-08-16', lines: '2' } });
			expect(raw.exists).toBe(true);
			expect(raw.text).toContain('three');
			expect(raw.text).not.toContain('one');
			const human = await get('/api/flow-daemon/logs', { query: { date: '2026-08-16', human: 'true' } });
			expect(human.text).toMatch(/\[INFO\s*\] one/);
		});

		it.each([[{ date: '16/08/2026' }], [{ lines: '0' }], [{ lines: '10001' }], [{ human: 'yes' }]])(
			'rejects %j',
			async query => {
				await expect(get('/api/flow-daemon/logs', { query })).rejects.toThrow();
			}
		);
	});

	describe('terminal text', () => {
		const ESC = String.fromCharCode(27);

		it('serves errors, step output and the daily log without ANSI escape sequences', async () => {
			writeExecution(
				configDir,
				execution('ans111', {
					status: 'failed',
					lastError: `${ESC}[31mboom${ESC}[0m`,
					steps: {
						build: {
							status: 'failed',
							error: `${ESC}[31mexit 1${ESC}[0m`,
							stderr: `${ESC}[1mcompile error${ESC}[0m`,
						},
					},
				})
			);
			const list = await get('/api/flow-daemon/executions');
			expect(list.items[0].lastError).toBe('boom');
			const detail = await get('/api/flow-daemon/executions/:id', { params: { id: 'ans111' } });
			expect(detail.steps[0].error).toBe('exit 1');
			expect(detail.text).toContain('compile error');
			expect(detail.text).not.toContain(ESC);

			fs.mkdirSync(path.join(configDir, 'logs'), { recursive: true });
			fs.writeFileSync(
				path.join(configDir, 'logs', '2026-08-16.ndjson'),
				`${JSON.stringify({ ts: '2026-08-16T12:00:00.000Z', level: 'info', msg: `${ESC}[32mgreen${ESC}[0m` })}\n`
			);
			const log = await get('/api/flow-daemon/logs', { query: { date: '2026-08-16', human: 'true' } });
			expect(log.text).toContain('green');
			expect(log.text).not.toContain(ESC);
		});
	});

	describe('execution logs', () => {
		const ESC = String.fromCharCode(27);

		beforeEach(() => {
			writeExecution(
				configDir,
				execution('log111', {
					status: 'failed',
					steps: {
						build: { status: 'failed', error: `${ESC}[31mexit 1${ESC}[0m`, stderr: 'compile error' },
						test: { status: 'completed' },
					},
				})
			);
			const entry = (stepId: string, level: string, message: string, second: number) =>
				JSON.stringify({
					prefix: `[log111|${stepId}]`,
					timestamp: `2026-08-16T12:00:0${second}.000Z`,
					level,
					message,
				});
			fs.mkdirSync(path.join(configDir, 'logs'), { recursive: true });
			fs.writeFileSync(
				path.join(configDir, 'logs', '2026-08-16.ndjson'),
				[
					entry('build', 'info', 'compiling', 1),
					entry('build', 'error', `${ESC}[31mfailed${ESC}[0m`, 2),
					entry('test', 'info', 'testing', 3),
				].join('\n') + '\n'
			);
		});

		it('returns the lines of the run, the steps to filter on and the recorded output of failed steps', async () => {
			const body = await get('/api/flow-daemon/executions/:id/logs', { params: { id: 'log1' } });
			expect(body).toMatchObject({ executionId: 'log111', flowId: 'deploy', total: 3, limit: 100, offset: 0 });
			expect(body.stepIds).toEqual(expect.arrayContaining(['build', 'test']));
			expect(body.entries.map((e: { message: string }) => e.message)).toEqual(['compiling', 'failed', 'testing']);
			expect(body.recordedOutput).toContain('compile error');
			expect(body.recordedOutput).not.toContain(ESC);
		});

		it('filters by step, level and text', async () => {
			const byStep = await get('/api/flow-daemon/executions/:id/logs', {
				params: { id: 'log111' },
				query: { step: 'test' },
			});
			expect(byStep.entries).toHaveLength(1);
			const byLevel = await get('/api/flow-daemon/executions/:id/logs', {
				params: { id: 'log111' },
				query: { level: 'error' },
			});
			expect(byLevel.entries.map((e: { stepId: string }) => e.stepId)).toEqual(['build']);
			const byText = await get('/api/flow-daemon/executions/:id/logs', {
				params: { id: 'log111' },
				query: { q: 'TESTING' },
			});
			expect(byText.total).toBe(1);
		});

		it('pages from the end', async () => {
			const body = await get('/api/flow-daemon/executions/:id/logs', {
				params: { id: 'log111' },
				query: { limit: '2', page: '1' },
			});
			expect(body.entries.map((e: { message: string }) => e.message)).toEqual(['compiling']);
			expect(body.offset).toBe(2);
		});

		it('reports an unknown execution as a 404 and an unknown level as a 400', async () => {
			const missing = await get('/api/flow-daemon/executions/:id/logs', { params: { id: 'zzz999' } }).catch(
				e => e
			);
			expect(missing.statusCode).toBe(404);
			const level = await get('/api/flow-daemon/executions/:id/logs', {
				params: { id: 'log111' },
				query: { level: 'loud' },
			}).catch(e => e);
			expect(level.statusCode).toBe(400);
		});

		it('says nothing was logged for a run without a log file', async () => {
			writeExecution(
				configDir,
				execution('nol111', { startedAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-01T10:01:00.000Z' })
			);
			const body = await get('/api/flow-daemon/executions/:id/logs', { params: { id: 'nol111' } });
			expect(body).toMatchObject({ total: 0, daysRead: [] });
		});
	});

	describe('workers', () => {
		it('explains an empty list when no daemon runs, without failing', async () => {
			const body = await get('/api/flow-daemon/workers');
			expect(body.workers).toEqual([]);
			expect(body.daemon.running).toBe(false);
			expect(body.emptyExplanation).toMatch(/No worker is connected/);
		});

		it('lists declared sources without credential hashes', async () => {
			fs.writeFileSync(
				path.join(configDir, 'worker-sources.json'),
				JSON.stringify({
					sources: [
						{
							sourceId: 'local',
							provider: 'built-in:command',
							labels: ['gpu'],
							maxWorkers: 2,
							tokenHash: 'SECRETHASH',
						},
					],
				})
			);
			const body = await get('/api/flow-daemon/workers');
			expect(body.declaredSources).toEqual([
				{ sourceId: 'local', provider: 'built-in:command', labels: ['gpu'], maxWorkers: 2 },
			]);
			expect(JSON.stringify(body)).not.toContain('SECRETHASH');
		});
	});

	describe('plugins', () => {
		it('lists the shipped plugins', async () => {
			const body = await get('/api/flow-daemon/plugins');
			expect(body.plugins.length).toBeGreaterThan(0);
			expect(body.plugins[0]).toEqual({
				id: expect.any(String),
				extensionPoint: expect.any(String),
				typeString: expect.any(String),
			});
		});

		it('describes one plugin and 404s on an unknown one', async () => {
			const first = (await get('/api/flow-daemon/plugins')).plugins[0].id as string;
			const detail = await get('/api/flow-daemon/plugins/:id', { params: { id: first } });
			expect(detail.id).toBe(first);
			expect(typeof detail.snippet).toBe('string');
			const error = await get('/api/flow-daemon/plugins/:id', { params: { id: 'nope' } }).catch(e => e);
			expect(error.statusCode).toBe(404);
		});
	});

	it('reports a missing plugin catalog as a 500 with the actionable message', async () => {
		const bare = mount(FlowQueryService.forConfigDir(configDir));
		const error = await bare('/api/flow-daemon/plugins').catch(e => e);
		expect(error.statusCode).toBe(500);
		expect(error.message).toMatch(/pluginManifests/);
	});
});

describe('FlowDaemonController project fields', () => {
	let configDir: string;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-controller-project-'));
		writeExecution(configDir, execution('pj1', { projectId: 'a1b2c3d4', projectRoot: '/work/app' }));
	});
	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('serves projectId and projectLabel in the list and in the detail, with the name from the lookup', async () => {
		const get = mount(
			FlowQueryService.forConfigDir(configDir, BUILTIN_PLUGIN_CATALOG, () => ({ kind: 'known', name: 'app' }))
		);
		const list = await get('/api/flow-daemon/executions');
		expect(list.items[0]).toMatchObject({ projectId: 'a1b2c3d4', projectLabel: 'app (a1b2c3d4)' });
		const detail = await get('/api/flow-daemon/executions/:id', { params: { id: 'pj1' } });
		expect(detail).toMatchObject({ projectId: 'a1b2c3d4', projectLabel: 'app (a1b2c3d4)' });
		expect(detail.text).toContain('Project:   app (a1b2c3d4)');
	});
});
