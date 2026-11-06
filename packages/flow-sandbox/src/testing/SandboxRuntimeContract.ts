import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SandboxRuntime } from '../SandboxRuntime';
import { rejection } from './ExpectedFailures';

export interface RuntimeUnderTest {
	runtime: SandboxRuntime;
	dispose: () => void;
}

/** The `onTestFinished` of the test context: concurrent tests must not share a global afterEach. */
type Finish = (cleanup: () => void) => void;

/**
 * Behaviour every SandboxRuntime must have. Run against SbxCliRuntime (through the mock sbx) and against
 * FakeSandboxRuntime, so the fake that later milestones rely on cannot drift from the real runtime.
 * Only behaviour observable through the SandboxRuntime interface is covered.
 *
 * Few tests, each walking one sandbox through a sequence: against the mock every call is a child process,
 * so a test per assertion would multiply the cost without covering more. The tests are independent (each calls
 * `create()` for its own runtime), so they run concurrently.
 */
export function describeSandboxRuntimeContract(label: string, create: () => RuntimeUnderTest): void {
	describe(`${label} satisfies the SandboxRuntime contract`, () => {
		function begin(onTestFinished: Finish): SandboxRuntime {
			const subject = create();
			onTestFinished(() => subject.dispose());
			return subject.runtime;
		}

		function directory(onTestFinished: Finish): string {
			const created = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-contract-'));
			onTestFinished(() => fs.rmSync(created, { recursive: true, force: true }));
			return created;
		}

		function request(
			mounts: string[],
			overrides: Record<string, unknown> = {}
		): Parameters<SandboxRuntime['create']>[0] {
			return {
				name: 'contract-1',
				agent: 'shell',
				mounts: mounts.map(hostPath => ({ hostPath })),
				cpus: 2,
				memory: '2g',
				...overrides,
			};
		}

		async function started(onTestFinished: Finish): Promise<{ runtime: SandboxRuntime; mounts: string[] }> {
			const runtime = begin(onTestFinished);
			const mounts = [directory(onTestFinished), directory(onTestFinished)];
			await runtime.create(request(mounts));
			return { runtime, mounts };
		}

		it.concurrent(
			'lists the created sandbox with its limits and mounts, refuses a duplicate name, stops it (an exec starts it again, start works), and removes it',
			async ({ onTestFinished }) => {
				const empty = begin(onTestFinished);
				expect(await empty.list()).toEqual([]);

				const { runtime, mounts } = await started(onTestFinished);

				const [info, ...others] = await runtime.list();
				expect(others).toEqual([]);
				expect(info).toMatchObject({
					name: 'contract-1',
					agent: 'shell',
					status: 'running',
					workspaces: mounts,
					cpus: 2,
					memoryMib: 2048,
				});

				expect((await rejection(runtime.create(request(mounts)))).kind).toBe('already-exists');

				await runtime.stop('contract-1');
				expect((await runtime.list())[0]?.status).toBe('stopped');
				expect((await runtime.exec({ sandbox: 'contract-1', command: ['true'] })).exitCode).toBe(0);
				expect((await runtime.list())[0]?.status).toBe('running');
				await runtime.stop('contract-1');
				await runtime.start('contract-1');
				expect((await runtime.list())[0]?.status).toBe('running');

				await runtime.remove('contract-1');
				expect(await runtime.list()).toEqual([]);
			}
		);

		it.concurrent(
			'adds and removes a per-sandbox network rule and a secret, and fails on removing what is not there',
			async ({ onTestFinished }) => {
				const { runtime } = await started(onTestFinished);

				await runtime.allowNetwork({ sandbox: 'contract-1', resources: ['localhost:19001'] });
				await runtime.removeNetwork({ sandbox: 'contract-1', resources: ['localhost:19001'] });
				expect(
					(await rejection(runtime.removeNetwork({ sandbox: 'contract-1', resources: ['localhost:19001'] })))
						.kind
				).toBe('command-failed');

				await runtime.setSecret({
					sandbox: 'contract-1',
					hosts: ['localhost'],
					envVar: 'TOKEN',
					placeholder: 'placeholder-1',
					valueCommand: 'echo s',
				});
				await runtime.setServiceSecret({ sandbox: 'contract-1', service: 'openai', value: 'sk-contract' });
				await runtime.removeSecret({ sandbox: 'contract-1', placeholder: 'placeholder-1' });
				expect(
					(await rejection(runtime.removeSecret({ sandbox: 'contract-1', placeholder: 'placeholder-1' })))
						.kind
				).toBe('command-failed');
			}
		);

		it.concurrent(
			'copies a directory in and out, and fails copying out a path that does not exist in the sandbox',
			async ({ onTestFinished }) => {
				const { runtime } = await started(onTestFinished);
				const source = directory(onTestFinished);
				fs.writeFileSync(path.join(source, 'file.txt'), 'content');

				await runtime.copyIn({ sandbox: 'contract-1', hostPath: source, sandboxPath: '/home/agent/data' });
				await runtime.copyOut({
					sandbox: 'contract-1',
					sandboxPath: '/home/agent/data',
					hostPath: path.join(directory(onTestFinished), 'out'),
				});

				const error = await rejection(
					runtime.copyOut({
						sandbox: 'contract-1',
						sandboxPath: '/home/agent/none',
						hostPath: path.join(directory(onTestFinished), 'out'),
					})
				);
				expect(error.kind).toBe('command-failed');
			}
		);

		it.concurrent(
			'reports every operation on a missing sandbox as not-found naming it',
			async ({ onTestFinished }) => {
				const runtime = begin(onTestFinished);
				const target = path.join(directory(onTestFinished), 'x');

				const errors = await Promise.all([
					rejection(runtime.exec({ sandbox: 'ghost-1', command: ['true'] })),
					rejection(runtime.stop('ghost-1')),
					rejection(runtime.start('ghost-1')),
					rejection(runtime.remove('ghost-1')),
					rejection(
						runtime.copyIn({ sandbox: 'ghost-1', hostPath: directory(onTestFinished), sandboxPath: '/x' })
					),
					rejection(runtime.copyOut({ sandbox: 'ghost-1', sandboxPath: '/x', hostPath: target })),
					rejection(runtime.allowNetwork({ sandbox: 'ghost-1', resources: ['localhost:1'] })),
					rejection(runtime.removeNetwork({ sandbox: 'ghost-1', resources: ['localhost:1'] })),
					rejection(
						runtime.setSecret({
							sandbox: 'ghost-1',
							hosts: ['localhost'],
							envVar: 'T',
							placeholder: 'placeholder-1',
							valueCommand: 'echo s',
						})
					),
					rejection(runtime.removeSecret({ sandbox: 'ghost-1', placeholder: 'placeholder-1' })),
					rejection(runtime.setServiceSecret({ sandbox: 'ghost-1', service: 'openai', value: 'k' })),
				]);

				for (const error of errors) {
					expect(error.kind).toBe('not-found');
					expect(error.message).toContain('ghost-1');
				}
			}
		);

		it.concurrent(
			'refuses an invalid create as invalid-argument and creates nothing',
			async ({ onTestFinished }) => {
				const runtime = begin(onTestFinished);
				const cases: [string, Record<string, unknown>][] = [
					['a bad name', { name: 'x' }],
					['zero cpus', { cpus: 0 }],
					['a memory without unit', { memory: '2048' }],
					['a memory below the minimum', { memory: '256m' }],
					['no mount', { mounts: [] }],
				];
				const mounts = [directory(onTestFinished)];

				for (const [caseLabel, override] of cases) {
					const error = await rejection(runtime.create(request(mounts, override)), caseLabel);

					expect(error.kind, caseLabel).toBe('invalid-argument');
				}
				expect(await runtime.list()).toEqual([]);
			}
		);

		it.concurrent(
			'refuses an invalid request on an existing sandbox as invalid-argument',
			async ({ onTestFinished }) => {
				const { runtime } = await started(onTestFinished);
				const cases: [string, () => Promise<unknown>][] = [
					[
						'a catch-all network resource',
						() => runtime.allowNetwork({ sandbox: 'contract-1', resources: ['**'] }),
					],
					[
						'a network resource without port',
						() => runtime.allowNetwork({ sandbox: 'contract-1', resources: ['localhost'] }),
					],
					[
						'a secret host with a port',
						() =>
							runtime.setSecret({
								sandbox: 'contract-1',
								hosts: ['localhost:19001'],
								envVar: 'T',
								placeholder: 'placeholder-1',
								valueCommand: 'echo s',
							}),
					],
					[
						'an unknown secret service',
						() =>
							// violations-suppress: ts/no-unsafe-type-cast the contract passes an invalid service on purpose
							runtime.setServiceSecret({
								sandbox: 'contract-1',
								service: 'nosuch' as 'openai',
								value: 'k',
							}),
					],
					['an empty exec command', () => runtime.exec({ sandbox: 'contract-1', command: [] })],
					[
						'a relative exec cwd',
						() => runtime.exec({ sandbox: 'contract-1', command: ['true'], cwd: 'rel' }),
					],
					[
						'a multi-line env value',
						() => runtime.exec({ sandbox: 'contract-1', command: ['true'], env: { A: 'x\ny' } }),
					],
					[
						'a relative sandbox path',
						() => runtime.copyIn({ sandbox: 'contract-1', hostPath: os.tmpdir(), sandboxPath: 'rel' }),
					],
				];

				for (const [caseLabel, act] of cases) {
					const error = await rejection(act(), caseLabel);

					expect(error.kind, caseLabel).toBe('invalid-argument');
				}
			}
		);
	});
}
