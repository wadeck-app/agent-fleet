import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HostToolFixtureDirectory } from '../test-utils/HostToolFixtureDirectory';
import { HostToolAuditLog } from './HostToolAuditLog';
import { HostToolCallService } from './HostToolCallService';
import { HostToolExecutableResolver } from './HostToolExecutableResolver';
import { HostToolExecutor } from './HostToolExecutor';
import type { HostToolExecution, HostToolExecutionResult } from './HostToolExecutor';

const ID_ARG = { type: 'string', pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$', required: true } as const;
const request = (toolId: string, args: Record<string, unknown>, callId = 'c1') => ({
	executionId: 'e1',
	callId,
	toolId,
	args,
});

describe('HostToolCallService', () => {
	let fixtures: HostToolFixtureDirectory;
	let workspace: string;
	const resolver = new HostToolExecutableResolver({ environment: process.env });

	beforeAll(() => {
		fixtures = HostToolFixtureDirectory.create();
		workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-svc-'));
	});
	afterAll(() => {
		fixtures.remove();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	/** A service over `tools`, with the real executor unless one is given. */
	const build = (
		tools: HostTool[],
		options: { executor?: Pick<HostToolExecutor, 'execute'>; maxCallsPerStep?: number } = {}
	) => {
		const lines: string[] = [];
		const executor = options.executor ?? new HostToolExecutor({ workerEnvironment: process.env, resolver });
		const executables = new Map(tools.map(tool => [tool.id, resolver.resolve('triage', tool)]));
		const service = new HostToolCallService({
			stepId: 'triage',
			tools,
			executables,
			executor,
			audit: new HostToolAuditLog('triage', line => lines.push(line)),
			workspaceDir: workspace,
			...(options.maxCallsPerStep === undefined ? {} : { maxCallsPerStep: options.maxCallsPerStep }),
		});
		return { service, lines };
	};

	const fakeExecutor = (
		behave: (execution: HostToolExecution) => Promise<HostToolExecutionResult>
	): { executor: Pick<HostToolExecutor, 'execute'>; calls: HostToolExecution[] } => {
		const calls: HostToolExecution[] = [];
		return {
			calls,
			executor: {
				execute: async execution => {
					calls.push(execution);
					return behave(execution);
				},
			},
		};
	};
	const done = (text = 'ok'): HostToolExecutionResult => ({
		reply: { ok: true, text, truncated: false, exitCode: 0 },
		durationMs: 1,
		stdoutBytes: text.length,
		envDenied: [],
		envMissing: [],
	});

	describe('argument checking: the checker is the gate (F-03)', () => {
		const tool: HostTool = {
			id: 'show',
			description: 'd',
			sideEffect: 'read',
			command: [process.execPath, '-v', '{id}'],
			args: { id: ID_ARG },
		};

		it.each([
			{ name: 'a command separator', value: 'a; rm -rf x' },
			{ name: 'a command substitution', value: '$(id)' },
			{ name: 'backticks', value: '`id`' },
			{ name: 'a logical and', value: 'a && b' },
			{ name: 'a pipe', value: 'x | cat' },
			{ name: 'a path traversal', value: '../../etc/passwd' },
			{ name: 'a dash option', value: '-rf' },
			{ name: 'a newline', value: 'a\nb' },
			{ name: 'a NUL', value: 'a\u0000b' },
			{ name: 'a very long value', value: 'z'.repeat(5000) },
			{ name: 'a number where a string is expected', value: 42 },
			{ name: 'an object', value: { $ne: 1 } },
		])('refuses $name before anything is spawned, and tells the model why', async ({ value }) => {
			const fake = fakeExecutor(async () => done());
			const { service, lines } = build([tool], { executor: fake.executor });
			const reply = await service.call(request('show', { id: value }));
			expect(fake.calls).toHaveLength(0);
			expect(reply).toMatchObject({ ok: false, exitCode: null, truncated: false });
			expect(reply.text).toMatch(/^Tool 'show' was not run: /);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain('"outcome":"denied"');
		});

		it('refuses an unknown argument and a missing required one', async () => {
			const fake = fakeExecutor(async () => done());
			const { service } = build([tool], { executor: fake.executor });
			expect((await service.call(request('show', { id: 'a', other: 'b' }))).text).toMatch(
				/unknown argument 'other'/
			);
			expect((await service.call(request('show', {}))).text).toMatch(/argument 'id' is required/);
			expect(fake.calls).toHaveLength(0);
		});

		it('hands the checked values, the resolved executable and the limits to the executor', async () => {
			const fake = fakeExecutor(async () => done('shown'));
			const { service } = build([tool], { executor: fake.executor });
			const reply = await service.call(request('show', { id: 'T-1' }));
			expect(reply.text).toBe('shown');
			expect(fake.calls[0]).toMatchObject({
				stepId: 'triage',
				values: { id: 'T-1' },
				workspaceDir: workspace,
				limits: { timeoutSeconds: 30, maxOutputBytes: 65_536 },
			});
			expect(fake.calls[0]!.executable.absolutePath).toBe(process.execPath);
		});

		it('refuses a tool id that is not declared (defence in depth)', async () => {
			const { service } = build([tool], { executor: fakeExecutor(async () => done()).executor });
			const reply = await service.call(request('other', {}));
			expect(reply.ok).toBe(false);
			expect(reply.text).toMatch(/not declared.*show/);
		});
	});

	describe('injection corpus through the whole call path (real process)', () => {
		const echo = (): HostTool => ({
			...fixtures.tool('echo.cjs', ['{v}']),
			id: 'echo',
			args: { v: { type: 'string', pattern: '^[\\s\\S]*$' } },
		});

		it.each([
			{ name: 'a command separator', value: 'a; rm -rf x' },
			{ name: 'a command substitution', value: '$(id)' },
			{ name: 'backticks', value: '`id`' },
			{ name: 'a logical and', value: 'a && b' },
			{ name: 'a pipe', value: 'x | cat' },
			{ name: 'a path traversal', value: '../../etc/passwd' },
			{ name: 'a newline', value: 'a\nb' },
		])('$name reaches the child as one inert argv element (pattern allows it)', async ({ value }) => {
			const { service } = build([echo()]);
			const reply = await service.call(request('echo', { v: value }));
			expect(reply.ok).toBe(true);
			expect(reply.text).toContain(`"argv":${JSON.stringify([value])},`);
		});

		it.each([
			{ name: 'a leading dash', value: '-rf' },
			{ name: 'a NUL', value: 'a\u0000b' },
			{ name: 'a 5000 character value', value: 'z'.repeat(5000) },
		])('$name is refused by the checker even with a permissive pattern', async ({ value }) => {
			const { service } = build([echo()]);
			const reply = await service.call(request('echo', { v: value }));
			expect(reply.ok).toBe(false);
			expect(reply.text).toMatch(/was not run/);
		});
	});

	describe('concurrency (F-12)', () => {
		it('runs at most 2 calls of a tool at once; the third gets a clear busy error and is audited', async () => {
			let release: () => void = () => {};
			const gate = new Promise<void>(resolve => (release = resolve));
			let running = 0;
			let peak = 0;
			const fake = fakeExecutor(async () => {
				running++;
				peak = Math.max(peak, running);
				await gate;
				running--;
				return done();
			});
			const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
			const { service, lines } = build([tool], { executor: fake.executor });
			const first = service.call(request('show', {}, 'a'));
			const second = service.call(request('show', {}, 'b'));
			const third = await service.call(request('show', {}, 'c'));
			expect(third).toMatchObject({ ok: false, exitCode: null });
			expect(third.text).toMatch(/was not run: 2 calls of this tool are already running.*Retry/);
			release();
			expect((await first).ok).toBe(true);
			expect((await second).ok).toBe(true);
			expect(peak).toBe(2);
			expect(lines.filter(line => line.includes('"outcome":"denied"'))).toHaveLength(1);
			// A slot is free again.
			expect((await service.call(request('show', {}, 'd'))).ok).toBe(true);
		});

		it('frees the slot when the executor throws', async () => {
			const fake = fakeExecutor(async () => {
				throw new Error('executor exploded');
			});
			const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
			const { service, lines } = build([tool], { executor: fake.executor });
			for (let index = 0; index < 4; index++) {
				const reply = await service.call(request('show', {}, `c${index}`));
				expect(reply.text).toContain('executor exploded');
				expect(reply.text).not.toMatch(/already running/);
			}
			expect(lines[0]).toContain('"outcome":"error"');
		});
	});

	describe('call-count limit per step (F-12)', () => {
		it('refuses calls beyond the limit, naming it, still auditing them', async () => {
			const fake = fakeExecutor(async () => done());
			const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
			const { service, lines } = build([tool], { executor: fake.executor, maxCallsPerStep: 3 });
			for (let index = 0; index < 3; index++)
				expect((await service.call(request('show', {}, `c${index}`))).ok).toBe(true);
			const refused = await service.call(request('show', {}, 'c3'));
			expect(refused.ok).toBe(false);
			expect(refused.text).toMatch(/limit of 3 calls per step/);
			expect(fake.calls).toHaveLength(3);
			expect(lines).toHaveLength(4);
			expect(lines[3]).toContain('"outcome":"denied"');
		});

		it('counts denied calls too (a flood of bad calls is still a flood)', async () => {
			const fake = fakeExecutor(async () => done());
			const tool: HostTool = {
				id: 'show',
				description: 'd',
				sideEffect: 'read',
				command: [process.execPath, '{id}'],
				args: { id: ID_ARG },
			};
			const { service } = build([tool], { executor: fake.executor, maxCallsPerStep: 2 });
			await service.call(request('show', { id: '-x' }));
			await service.call(request('show', { id: '-y' }));
			const third = await service.call(request('show', { id: 'ok' }));
			expect(third.text).toMatch(/limit of 2 calls per step/);
			expect(fake.calls).toHaveLength(0);
		});

		it('defaults to 100', async () => {
			const fake = fakeExecutor(async () => done());
			const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
			const { service } = build([tool], { executor: fake.executor });
			for (let index = 0; index < 100; index++) await service.call(request('show', {}, `c${index}`));
			expect((await service.call(request('show', {}, 'c100'))).text).toMatch(/limit of 100 calls per step/);
		});

		it('counters belong to the service instance: a new service starts again at zero', async () => {
			const fake = fakeExecutor(async () => done());
			const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
			const first = build([tool], { executor: fake.executor, maxCallsPerStep: 1 }).service;
			await first.call(request('show', {}));
			expect((await first.call(request('show', {}))).ok).toBe(false);
			const second = build([tool], { executor: fake.executor, maxCallsPerStep: 1 }).service;
			expect((await second.call(request('show', {}))).ok).toBe(true);
		});
	});

	describe('abort of the call in flight', () => {
		const tool: HostTool = { id: 'show', description: 'd', sideEffect: 'read', command: [process.execPath] };
		let fakeCalls: number;
		beforeEach(() => {
			fakeCalls = 0;
		});

		it.each([['step ended'], ['connection closed']])(
			'%s: hands the signal to the executor, audits "aborted: %s", frees the concurrency slots',
			async reason => {
				// The first two calls (the tool's default concurrency) hang until aborted; later ones answer at once.
				const fake = fakeExecutor(execution =>
					fakeCalls++ >= 2
						? Promise.resolve(done())
						: new Promise(resolve => {
								execution.signal!.addEventListener('abort', () =>
									resolve({
										...done('stopped'),
										aborted: true,
										reply: { ...done().reply, ok: false, exitCode: null },
									})
								);
							})
				);
				const { service, lines } = build([tool], { executor: fake.executor });
				const controller = new AbortController();
				const first = service.call(request('show', {}, 'c-abort-1'), controller.signal);
				const second = service.call(request('show', {}, 'c-abort-2'), controller.signal);
				await vi.waitFor(() => expect(fake.calls).toHaveLength(2));
				expect(fake.calls[0]!.signal).toBe(controller.signal);
				controller.abort(reason);
				await Promise.all([first, second]);

				expect(lines).toHaveLength(2);
				const audit = JSON.parse(lines[0]!.slice(lines[0]!.indexOf('{'))) as Record<string, unknown>;
				expect(audit).toMatchObject({ outcome: 'aborted', reason: `aborted: ${reason}`, callId: 'c-abort-1' });

				// Both slots are released: the next call runs instead of answering "already running".
				const next = await service.call(request('show', {}, 'c-next'), new AbortController().signal);
				expect(next.ok).toBe(true);
			}
		);

		it('a call that finishes normally keeps its normal outcome', async () => {
			const fake = fakeExecutor(async () => done());
			const { service, lines } = build([tool], { executor: fake.executor });
			await service.call(request('show', {}), new AbortController().signal);
			expect(lines[0]).toContain('"outcome":"ok"');
		});
	});

	describe('audit (F-17)', () => {
		it('one line per call: values only for log:true, never output, env or tokens (canaries)', async () => {
			const tool: HostTool = {
				...fixtures.tool('echo.cjs', ['{id}', '{note}']),
				id: 'show',
				args: {
					id: { type: 'string', pattern: '^[A-Za-z0-9-]+$', log: true },
					note: { type: 'string', pattern: '^[A-Za-z0-9-]+$' },
				},
				env: ['FLOW_WORKER_TOKEN'],
			};
			vi.stubEnv('FLOW_WORKER_TOKEN', 'WORKER-TOKEN-CANARY');
			try {
				const lines: string[] = [];
				const service = new HostToolCallService({
					stepId: 'triage',
					tools: [tool],
					executables: new Map([['show', resolver.resolve('triage', tool)]]),
					executor: new HostToolExecutor({ workerEnvironment: process.env, resolver }),
					audit: new HostToolAuditLog('triage', line => lines.push(line)),
					workspaceDir: workspace,
				});
				const reply = await service.call(request('show', { id: 'T-1', note: 'private-note-CANARY' }));
				expect(reply.ok).toBe(true);
				expect(lines).toHaveLength(1);
				expect(lines[0]).toContain('T-1');
				expect(lines[0]).not.toContain('private-note-CANARY');
				expect(lines[0]).not.toContain('WORKER-TOKEN-CANARY');
				// Output content (the echoed argv and env) is never logged, only its size.
				expect(lines[0]).not.toContain('"argv"');
				expect(lines[0]).toMatch(/"outputBytes":\d+/);
				expect(lines[0]).toContain('"envDenied":["FLOW_WORKER_TOKEN"]');
			} finally {
				vi.unstubAllEnvs();
			}
		});
	});
});
