import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SandboxError } from './SandboxError';
import type { CreateSandboxRequest } from './SandboxRuntime';
import type { SbxCliRuntime, SbxCliRuntimeOptions } from './SbxCliRuntime';
import { rejection } from './testing/ExpectedFailures';
import { MOCK_SBX_PATH, MockSbxHarness } from './testing/MockSbxHarness';

// Every call of the mock is a real child process (about 50 ms each): a test spends them on one sandbox that goes
// through a whole sequence, and the invalid-argument cases (refused before any process starts) share one runtime.
// The tests are independent (each has its own mock state directory), so they run concurrently.

/** The `onTestFinished` of the test context: concurrent tests must not share a global afterEach. */
type Finish = (cleanup: () => void) => void;

interface World {
	harness: MockSbxHarness;
	runtime: SbxCliRuntime;
	workspace: string;
	meta: string;
}

function world(onTestFinished: Finish, scenario?: string, options: SbxCliRuntimeOptions = {}): World {
	const harness = new MockSbxHarness(scenario);
	onTestFinished(() => harness.dispose());
	return {
		harness,
		runtime: harness.runtime(options),
		workspace: harness.makeDirectory('ws-'),
		meta: harness.makeDirectory('meta-'),
	};
}

function createRequest(
	workspace: string,
	meta: string,
	overrides: Partial<CreateSandboxRequest> = {}
): CreateSandboxRequest {
	return {
		name: 'box-1',
		agent: 'shell',
		mounts: [{ hostPath: workspace }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
		...overrides,
	};
}

/** A world whose runtime already created `box-1`. */
async function boxed(onTestFinished: Finish, scenario?: string, options: SbxCliRuntimeOptions = {}): Promise<World> {
	const created = world(onTestFinished, scenario, options);
	await created.runtime.create(createRequest(created.workspace, created.meta));
	return created;
}

describe('SbxCliRuntime create', () => {
	it.concurrent(
		'builds the exact command line, always passes --cpus and -m, and reports a duplicate name and a failing sbx with the fix',
		async ({ onTestFinished }) => {
			const { harness, runtime, workspace, meta } = world(onTestFinished);
			await runtime.create(
				createRequest(workspace, meta, {
					image: 'flow-sandbox:poc',
					pull: 'never',
					mounts: [{ hostPath: workspace }, { hostPath: meta, readOnly: true }],
				})
			);

			const calls = harness.callsWithVerb('create');
			expect(calls).toHaveLength(1);
			expect(calls[0]?.argv).toEqual([
				'create',
				'--name',
				'box-1',
				'--cpus',
				'2',
				'-m',
				'2g',
				'-t',
				'flow-sandbox:poc',
				'--pull',
				'never',
				'shell',
				workspace,
				`${meta}:ro`,
			]);

			// sbx would fall back to 20 CPUs and half of the RAM without the explicit limits.
			await runtime.create(createRequest(workspace, meta, { name: 'box-2', cpus: 3, memory: '1G' }));
			expect(harness.state().sandboxes['box-2']).toMatchObject({ cpus: 3, memory: '1g', memory_mib: 1024 });
			expect(harness.callsWithVerb('create')[1]?.argv).toEqual(
				expect.arrayContaining(['--cpus', '3', '-m', '1g'])
			);

			const duplicate = await rejection(runtime.create(createRequest(workspace, meta)));
			expect(duplicate.kind).toBe('already-exists');
			expect(duplicate.message).toContain('Choose another name or remove the existing sandbox first');
			expect(duplicate.sandbox).toBe('box-1');

			const missing = path.join(workspace, 'does-not-exist');
			const failed = await rejection(runtime.create(createRequest(workspace, missing, { name: 'box-3' })));
			expect(failed.kind).toBe('command-failed');
			expect(failed.exitCode).toBe(1);
			expect(failed.message).toContain('does not exist');
		}
	);

	it.concurrent(
		'converts a Git Bash style mount path to the Windows form sbx.exe needs',
		async ({ onTestFinished }) => {
			const { harness } = world(onTestFinished);
			const windowsRuntime = harness.runtime({ platform: 'win32' });
			// The directory does not exist on any machine: the mock refuses it, after recording what it received.
			const error = await rejection(
				windowsRuntime.create({
					name: 'box-1',
					agent: 'shell',
					mounts: [{ hostPath: '/c/Users/me/ws dir' }, { hostPath: 'd:/meta/' }],
					cpus: 2,
					memory: '2g',
				})
			);

			expect(error.kind).toBe('command-failed');
			expect(harness.callsWithVerb('create')[0]?.argv.slice(-2)).toEqual(['C:\\Users\\me\\ws dir', 'D:\\meta\\']);
		}
	);

	it.concurrent('refuses an invalid request before running any command', async ({ onTestFinished }) => {
		const { harness, runtime, workspace, meta } = world(onTestFinished);
		const cases: [string, Partial<CreateSandboxRequest>, string][] = [
			['a one-character name', { name: 'a' }, 'Sandbox name "a" is not valid'],
			['a name starting with a hyphen', { name: '-box' }, 'is not valid'],
			['the reserved name', { name: 'default' }, 'reserved'],
			['an uppercase agent', { agent: 'Shell' }, 'Agent "Shell" is not valid'],
			['zero cpus', { cpus: 0 }, 'cpus must be a whole number of at least 1'],
			['fractional cpus', { cpus: 1.5 }, 'cpus must be a whole number of at least 1'],
			['a memory without unit', { memory: '2048' }, 'must look like "512m" or "2g"'],
			['a memory below the minimum', { memory: '256m' }, 'below the sbx minimum of 512m'],
			['no mount', { mounts: [] }, 'needs at least one mount'],
			['an image with whitespace', { image: 'a b' }, 'without whitespace'],
			['a relative mount', { mounts: [{ hostPath: 'relative/dir' }] }, 'cannot be given to sbx'],
		];

		for (const [label, override, message] of cases) {
			const error = await rejection(runtime.create(createRequest(workspace, meta, override)), label);

			expect(error.kind, label).toBe('invalid-argument');
			expect(error.message, label).toContain(message);
		}
		expect(harness.calls()).toEqual([]);
	});
});

describe('SbxCliRuntime exec', () => {
	it.concurrent(
		'runs commands with the exact argument array, -i/-w only when needed, the environment through a private env file, and a failing program as a result',
		async ({ onTestFinished }) => {
			const { harness, runtime } = await boxed(onTestFinished);
			const lastExec = (): string[] | undefined => harness.callsWithVerb('exec').at(-1)?.argv;

			const echoed = await runtime.exec({ sandbox: 'box-1', command: ['echo', 'hi there'] });
			expect(echoed).toEqual({ exitCode: 0, stdout: 'hi there\n', stderr: '' });
			expect(lastExec()).toEqual(['exec', 'box-1', '--', 'echo', 'hi there']);

			const piped = await runtime.exec({
				sandbox: 'box-1',
				command: ['cat'],
				stdin: 'echo "multi\nline"\n',
				cwd: '/c/Users/me/ws',
			});
			expect(piped.stdout).toBe('echo "multi\nline"\n');
			expect(lastExec()).toEqual(['exec', '-i', '-w', '/c/Users/me/ws', 'box-1', '--', 'cat']);
			const pwd = await runtime.exec({ sandbox: 'box-1', command: ['pwd'], cwd: '/c/Users/me/ws' });
			expect(pwd.stdout).toBe('/c/Users/me/ws\n');

			// The environment never reaches the command line, and the file that carried it is removed.
			const withEnv = await runtime.exec({
				sandbox: 'box-1',
				command: ['printenv', 'SECRET_TOKEN'],
				env: { SECRET_TOKEN: 'abc 123=x', OTHER: 'v' },
			});
			expect(withEnv).toMatchObject({ exitCode: 0, stdout: 'abc 123=x\n' });
			const envCall = harness.callsWithVerb('exec').at(-1);
			expect(envCall?.envFileContent).toBe('SECRET_TOKEN=abc 123=x\nOTHER=v\n');
			const envFileIndex = envCall?.argv.indexOf('--env-file') ?? -1;
			expect(envFileIndex).toBeGreaterThan(0);
			expect(envCall?.argv.join(' ')).not.toContain('abc 123');
			expect(fs.existsSync(envCall?.argv[envFileIndex + 1] ?? '')).toBe(false);

			// A non-zero exit and the separate stderr are a result, not an error; stderr chunks reach onStderr.
			const seen: string[] = [];
			const failed = await runtime.exec({
				sandbox: 'box-1',
				command: ['fail', '7', 'boom'],
				onStderr: text => seen.push(text),
			});
			expect(failed).toEqual({ exitCode: 7, stdout: '', stderr: 'boom\n' });
			expect(seen.join('')).toBe('boom\n');

			// A program that prints the not-found text of sbx is not a missing sandbox.
			const printed = await runtime.exec({
				sandbox: 'box-1',
				command: ['fail', '1', "error: sandbox 'box-1' not found"],
			});
			expect(printed.exitCode).toBe(1);
		}
	);

	it.concurrent('streams output while the command is still running', async ({ onTestFinished }) => {
		const { runtime } = await boxed(onTestFinished);
		const chunks: { text: string; at: number }[] = [];
		const started = performance.now();

		const result = await runtime.exec({
			sandbox: 'box-1',
			command: ['stream', '2', '150'],
			onStdout: text => chunks.push({ text, at: performance.now() - started }),
		});
		const finished = performance.now() - started;

		expect(chunks.map(chunk => chunk.text).join('')).toBe('line 1\nline 2\n');
		expect(result.stdout).toBe('line 1\nline 2\n');
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		// The mock sleeps 150 ms between the lines (a sleep is never shorter): a runtime that buffered until the end
		// would deliver the first chunk right before `finished`.
		expect(finished - (chunks[0]?.at ?? finished)).toBeGreaterThanOrEqual(100);
	});

	it.concurrent(
		'kills the host process on abort and says that the sandbox process may keep running; an already aborted signal spawns nothing',
		async ({ onTestFinished }) => {
			const { harness, runtime } = await boxed(onTestFinished);
			const controller = new AbortController();

			const pending = runtime.exec({
				sandbox: 'box-1',
				command: ['hang'],
				signal: controller.signal,
				onStdout: () => controller.abort(),
			});
			const error = await rejection(pending);

			expect(error.kind).toBe('aborted');
			expect(error.message).toContain('does NOT stop a process already running inside the sandbox');

			const before = harness.callsWithVerb('exec').length;
			const aborted = new AbortController();
			aborted.abort();

			const again = await rejection(
				runtime.exec({ sandbox: 'box-1', command: ['true'], signal: aborted.signal })
			);

			expect(again.kind).toBe('aborted');
			expect(harness.callsWithVerb('exec')).toHaveLength(before);
		}
	);

	it.concurrent('kills the process and reports a timeout', async ({ onTestFinished }) => {
		const { runtime } = await boxed(onTestFinished, undefined, { execTimeoutMs: 300 });

		const error = await rejection(runtime.exec({ sandbox: 'box-1', command: ['hang'] }));

		expect(error.kind).toBe('timeout');
		expect(error.message).toContain('did not finish within 300 ms');
	});

	it.concurrent(
		'reports a missing sandbox as not-found with the real sbx wording for every operation, and refuses a service secret for it without calling "secret set"',
		async ({ onTestFinished }) => {
			const { harness, runtime } = world(onTestFinished);

			const exec = await rejection(runtime.exec({ sandbox: 'ghost-1', command: ['true'] }));
			expect(exec.kind).toBe('not-found');
			expect(exec.message).toContain("error: sandbox 'ghost-1' not found");
			expect(exec.message).toContain('sbx ls');

			const operations: [string, () => Promise<unknown>][] = [
				['stop', () => runtime.stop('ghost-1')],
				['start', () => runtime.start('ghost-1')],
				['rm', () => runtime.remove('ghost-1')],
				[
					'cp',
					() =>
						runtime.copyOut({
							sandbox: 'ghost-1',
							sandboxPath: '/x',
							hostPath: path.join(harness.makeDirectory(), 'x'),
						}),
				],
				['allow', () => runtime.allowNetwork({ sandbox: 'ghost-1', resources: ['localhost:1'] })],
			];
			for (const [label, act] of operations) {
				const error = await rejection(act(), label);

				expect(error.kind, label).toBe('not-found');
				expect(error.sandbox, label).toBe('ghost-1');
			}

			const secret = await rejection(
				runtime.setServiceSecret({ sandbox: 'ghost-1', service: 'openai', value: 'k' })
			);
			expect(secret.kind).toBe('not-found');
			expect(secret.message).toContain('Create the sandbox first');
			expect(harness.callsWithVerb('secret')).toEqual([]);
		}
	);

	it.concurrent(
		'refuses an invalid exec before running exec and leaves no env file behind',
		async ({ onTestFinished }) => {
			const { harness } = world(onTestFinished);
			const tempDirectory = harness.makeDirectory('exec-temp-');
			const guarded = harness.runtime({ tempDirectory });
			const cases: [string, Parameters<SbxCliRuntime['exec']>[0], string][] = [
				['an empty command', { sandbox: 'box-1', command: [] }, 'non-empty command'],
				['an empty argument', { sandbox: 'box-1', command: ['echo', ''] }, 'non-empty command'],
				[
					'a relative cwd',
					{ sandbox: 'box-1', command: ['true'], cwd: 'rel/dir' },
					'must be an absolute path as seen inside the sandbox',
				],
				[
					'a Windows cwd',
					{ sandbox: 'box-1', command: ['true'], cwd: 'C:\\x' },
					'Translate host paths with PathTranslator first',
				],
				[
					'a bad env name',
					{ sandbox: 'box-1', command: ['true'], env: { 'A B': '1' } },
					'Environment variable name "A B" is not valid',
				],
				[
					'a multi-line env value',
					{ sandbox: 'box-1', command: ['true'], env: { A: 'x\ny' } },
					'contains a newline',
				],
				['a bad sandbox name', { sandbox: 'x', command: ['true'] }, 'Sandbox name "x" is not valid'],
			];

			for (const [label, request, message] of cases) {
				const error = await rejection(guarded.exec(request), label);

				expect(error.kind, label).toBe('invalid-argument');
				expect(error.message, label).toContain(message);
			}
			expect(harness.callsWithVerb('exec')).toEqual([]);
			expect(fs.readdirSync(tempDirectory)).toEqual([]);
		}
	);
});

describe('SbxCliRuntime lifecycle, listing and copy', () => {
	it.concurrent(
		'lists, stops, restarts through exec, starts and removes with the exact arguments',
		async ({ onTestFinished }) => {
			const { harness, runtime, workspace, meta } = world(onTestFinished);
			expect(await runtime.list()).toEqual([]);
			expect(harness.callsWithVerb('ls')[0]?.argv).toEqual(['ls', '--json']);

			await runtime.create(createRequest(workspace, meta));
			expect(await runtime.list()).toEqual([
				{
					name: 'box-1',
					agent: 'shell',
					status: 'running',
					workspaces: [workspace, meta],
					cpus: 2,
					memoryMib: 2048,
					createdAt: '2026-10-26T00:00:00Z',
				},
			]);

			await runtime.stop('box-1');
			expect(harness.callsWithVerb('stop')[0]?.argv).toEqual(['stop', 'box-1']);
			expect((await runtime.list())[0]?.status).toBe('stopped');

			// An exec starts a stopped sandbox implicitly.
			await runtime.exec({ sandbox: 'box-1', command: ['true'] });
			expect((await runtime.list())[0]?.status).toBe('running');

			// start() is a trivial exec.
			await runtime.stop('box-1');
			await runtime.start('box-1');
			expect(harness.callsWithVerb('exec').at(-1)?.argv).toEqual(['exec', 'box-1', '--', 'true']);
			expect((await runtime.list())[0]?.status).toBe('running');

			await runtime.remove('box-1');
			expect(harness.callsWithVerb('rm')[0]?.argv).toEqual(['rm', '--force', 'box-1']);
			expect(await runtime.list()).toEqual([]);
		}
	);

	it.concurrent(
		'copies a directory in and a file out with the exact arguments, and refuses relative paths before running anything',
		async ({ onTestFinished }) => {
			const { harness, runtime, workspace, meta } = world(onTestFinished);
			const relativeSandbox = await rejection(
				runtime.copyIn({ sandbox: 'box-1', hostPath: harness.makeDirectory(), sandboxPath: 'rel' })
			);
			const relativeHost = await rejection(
				runtime.copyOut({ sandbox: 'box-1', sandboxPath: '/x', hostPath: 'rel' })
			);
			expect(relativeSandbox.message).toContain('must be absolute');
			expect(relativeHost.message).toContain('Copy destination path');
			expect(harness.calls()).toEqual([]);

			await runtime.create(createRequest(workspace, meta));
			const source = harness.makeDirectory('cp-src-');
			fs.writeFileSync(path.join(source, 'session.jsonl'), 'hello');
			const back = path.join(harness.makeDirectory('cp-back-'), 'copy');

			await runtime.copyIn({ sandbox: 'box-1', hostPath: source, sandboxPath: '/home/agent/store' });
			await runtime.copyOut({ sandbox: 'box-1', sandboxPath: '/home/agent/store', hostPath: back });

			expect(harness.callsWithVerb('cp').map(call => call.argv)).toEqual([
				['cp', source, 'box-1:/home/agent/store'],
				['cp', 'box-1:/home/agent/store', back],
			]);
			expect(fs.readFileSync(path.join(back, 'session.jsonl'), 'utf8')).toBe('hello');
			expect(fs.existsSync(harness.vmPath('box-1', '/home/agent/store/session.jsonl'))).toBe(true);
		}
	);
});

describe('SbxCliRuntime network rules and secrets', () => {
	it.concurrent(
		'adds and removes per-sandbox rules and secrets with the exact arguments, never machine-wide, keeps secret values off the command line, and drops them with the sandbox',
		async ({ onTestFinished }) => {
			const { harness, runtime } = await boxed(onTestFinished);
			const resources = ['localhost:19001', 'bedrock-runtime.us-east-1.amazonaws.com:443', '*.npmjs.org:443'];

			await runtime.allowNetwork({ sandbox: 'box-1', resources });
			await runtime.removeNetwork({ sandbox: 'box-1', resources });

			expect(harness.callsWithVerb('policy').map(call => call.argv)).toEqual([
				['policy', 'allow', 'network', '--sandbox', 'box-1', resources.join(',')],
				['policy', 'rm', 'network', '--sandbox', 'box-1', '--resource', resources.join(','), '--force'],
			]);
			expect(harness.state().rules).toEqual([]);

			await runtime.setSecret({
				sandbox: 'box-1',
				hosts: ['localhost', 'api.example.com'],
				envVar: 'HOST_TOKEN',
				placeholder: 'flow-ph-0123456789',
				valueCommand: 'type C:\\secrets\\token.txt',
			});
			await runtime.removeSecret({ sandbox: 'box-1', placeholder: 'flow-ph-0123456789' });

			expect(harness.callsWithVerb('secret').map(call => call.argv)).toEqual([
				[
					'secret',
					'set-custom',
					'--sandbox',
					'box-1',
					'--host',
					'localhost',
					'--host',
					'api.example.com',
					'--env',
					'HOST_TOKEN',
					'--placeholder',
					'flow-ph-0123456789',
					'--command',
					'type C:\\secrets\\token.txt',
				],
				['secret', 'rm', '--sandbox', 'box-1', '--placeholder', 'flow-ph-0123456789', '--force'],
			]);
			expect(harness.state().secrets).toEqual([]);

			// The service key travels on standard input, never in the arguments.
			await runtime.setServiceSecret({ sandbox: 'box-1', service: 'openai', value: 'sk-test-key-123' });
			const serviceCall = harness.callsWithVerb('secret', 'set').at(-1);
			expect(serviceCall?.argv).toEqual(['secret', 'set', 'openai', '--sandbox', 'box-1']);
			expect(serviceCall?.stdin).toBe('sk-test-key-123\n');
			expect(JSON.stringify(serviceCall?.argv)).not.toContain('sk-test-key-123');
			expect(harness.state().secrets).toEqual([{ sandbox: 'box-1', service: 'openai', valueLength: 15 }]);

			// Whatever the sequence, every scoped call names the sandbox.
			await runtime.allowNetwork({ sandbox: 'box-1', resources: ['example.org:443'] });
			const scoped = harness
				.calls()
				.filter(call => ['policy', 'secret'].includes(call.argv[0] ?? '') && call.argv[1] !== 'ls');
			expect(scoped).toHaveLength(6);
			for (const call of scoped) {
				const index = call.argv.indexOf('--sandbox');
				expect(index, `no --sandbox in: ${call.argv.join(' ')}`).toBeGreaterThan(-1);
				expect(call.argv[index + 1]).toBe('box-1');
			}

			// The rules and secrets scoped to a sandbox go with it.
			await runtime.setSecret({
				sandbox: 'box-1',
				hosts: ['localhost'],
				envVar: 'TOKEN',
				placeholder: 'placeholder-1',
				valueCommand: 'echo s',
			});
			await runtime.setServiceSecret({ sandbox: 'box-1', service: 'anthropic', value: 'sk-ant-test' });
			await runtime.remove('box-1');

			expect(harness.state().rules).toEqual([]);
			expect(harness.state().secrets).toEqual([]);
		}
	);

	it.concurrent(
		'refuses invalid resources, secrets and service secrets before running any policy or secret command',
		async ({ onTestFinished }) => {
			const { harness, runtime } = world(onTestFinished);
			const resourceCases: [string, string[], string][] = [
				['no resource', [], 'at least one'],
				['a host without port', ['localhost'], 'Network resource "localhost" is not valid'],
				['a catch-all', ['**'], 'never opens a catch-all pattern'],
				['a catch-all with a port', ['**:443'], 'never opens a catch-all pattern'],
				['a single star host', ['*:443'], 'never opens a catch-all pattern'],
				['a scheme', ['https://example.org:443'], 'is not valid'],
				['whitespace', ['a b:1'], 'is not valid'],
			];
			for (const [label, resources, message] of resourceCases) {
				const allow = await rejection(runtime.allowNetwork({ sandbox: 'box-1', resources }), label);
				const remove = await rejection(runtime.removeNetwork({ sandbox: 'box-1', resources }), label);

				expect(allow.kind, label).toBe('invalid-argument');
				expect(allow.message, label).toContain(message);
				expect(remove.kind, label).toBe('invalid-argument');
			}

			const base = {
				sandbox: 'box-1',
				hosts: ['localhost'],
				envVar: 'TOKEN',
				placeholder: 'placeholder-1',
				valueCommand: 'echo s',
			};
			const secretCases: [string, Partial<typeof base>, string][] = [
				['a host with a port', { hosts: ['localhost:19001'] }, 'WITHOUT a port'],
				['a catch-all host', { hosts: ['*'] }, 'every site'],
				['no host', { hosts: [] }, 'at least one host'],
				['a bad env var', { envVar: '1BAD' }, 'not a valid variable name'],
				['a short placeholder', { placeholder: 'abc' }, 'at least 8 characters'],
				['an empty value command', { valueCommand: '  ' }, 'valueCommand'],
			];
			for (const [label, override, message] of secretCases) {
				const error = await rejection(runtime.setSecret({ ...base, ...override }), label);

				expect(error.kind, label).toBe('invalid-argument');
				expect(error.message, label).toContain(message);
			}

			const serviceCases: [string, { service: string; value: string }, string][] = [
				['an unknown service', { service: 'bedrock', value: 'k' }, 'is not an sbx built-in service'],
				['an empty key', { service: 'openai', value: '  ' }, 'is empty'],
				['a key with a newline', { service: 'openai', value: 'a\nb' }, 'newline or NUL'],
			];
			for (const [label, override, message] of serviceCases) {
				const error = await rejection(
					// violations-suppress: ts/no-unsafe-type-cast the test passes an invalid service on purpose
					runtime.setServiceSecret({ sandbox: 'box-1', ...override } as Parameters<
						SbxCliRuntime['setServiceSecret']
					>[0]),
					label
				);

				expect(error.kind, label).toBe('invalid-argument');
				expect(error.message, label).toContain(message);
			}

			const placeholder = await rejection(runtime.removeSecret({ sandbox: 'box-1', placeholder: 'x' }));
			expect(placeholder.kind).toBe('invalid-argument');

			expect(harness.callsWithVerb('policy')).toEqual([]);
			expect(harness.callsWithVerb('secret')).toEqual([]);
		}
	);

	it.concurrent(
		'reports removing a rule as not-found when the sandbox is gone (keeping the sbx text as the cause), also when another sandbox covers it, and as command-failed when the sandbox exists but has no such rule',
		async ({ onTestFinished }) => {
			const { harness, runtime, workspace, meta } = world(onTestFinished);
			await runtime.create(createRequest(workspace, meta));
			await runtime.create(createRequest(workspace, meta, { name: 'box-2' }));
			await runtime.allowNetwork({ sandbox: 'box-1', resources: ['localhost:7'] });
			await runtime.allowNetwork({ sandbox: 'box-2', resources: ['localhost:7'] });
			await runtime.allowNetwork({ sandbox: 'box-1', resources: ['localhost:1'] });
			await runtime.remove('box-1');

			const gone = await rejection(runtime.removeNetwork({ sandbox: 'box-1', resources: ['localhost:1'] }));
			expect(gone.kind).toBe('not-found');
			expect(gone.message).toContain('Sandbox "box-1" does not exist');
			expect(gone.message).toContain('no scoped policy found for sandbox "box-1"');
			expect(gone.cause).toBeInstanceOf(SandboxError);

			const covered = await rejection(runtime.removeNetwork({ sandbox: 'box-1', resources: ['localhost:7'] }));
			expect(covered.kind).toBe('not-found');
			expect(covered.message).toContain(
				'is covered by rule mock-rule-2 in sandbox "box-2", not in sandbox "box-1"'
			);
			expect(harness.state().rules.map(rule => rule['sandbox_id'])).toEqual(['box-2']);

			const noRule = await rejection(runtime.removeNetwork({ sandbox: 'box-2', resources: ['localhost:1'] }));
			expect(noRule.kind).toBe('command-failed');
		}
	);
});

describe('SbxCliRuntime environment, version and binary', () => {
	it.concurrent(
		'sets MSYS_NO_PATHCONV=1 for every sbx child even when the caller sets another value, and checks the pinned version once per instance, before the first command',
		async ({ onTestFinished }) => {
			const { harness, workspace, meta } = world(onTestFinished);
			const runtime = harness.runtime({ env: { ...harness.env(), MSYS_NO_PATHCONV: '0' } });

			await runtime.create(createRequest(workspace, meta));
			await runtime.list();
			await runtime.stop('box-1');

			const calls = harness.calls();
			expect(calls.map(call => call.argv[0])).toEqual(['version', 'create', 'ls', 'stop']);
			expect(calls.every(call => call.msysNoPathconv === '1')).toBe(true);
		}
	);

	it.concurrent(
		'refuses any other sbx version naming expected, found and the fix, does not cache the failure, and readVersion reports it without enforcing the pin',
		async ({ onTestFinished }) => {
			const { harness, runtime, workspace, meta } = world(onTestFinished, 'version:0.50.0');

			const error = await rejection(runtime.create(createRequest(workspace, meta)));

			expect(error.kind).toBe('version-mismatch');
			expect(error.message).toContain('sbx 0.50.0 found at');
			expect(error.message).toContain(MOCK_SBX_PATH);
			expect(error.message).toContain('pinned to sbx 0.49.2');
			expect(error.message).toContain('https://github.com/docker/sbx-releases/releases/tag/v0.49.2');
			expect(error.message).toContain('PINNED_SBX_VERSION');
			expect(harness.callsWithVerb('create')).toEqual([]);

			await rejection(runtime.list());
			expect(harness.callsWithVerb('version')).toHaveLength(2);

			expect(await runtime.readVersion()).toEqual({
				version: '0.50.0',
				commit: '5d40fd43027b33ed1f1a39c14fb07e2503d6998f',
				binaryPath: MOCK_SBX_PATH,
			});
		}
	);

	it.concurrent(
		'fails with an actionable message when the executable does not exist or is not sbx, and surfaces a daemon failure with its stderr',
		async ({ onTestFinished }) => {
			const { harness } = world(onTestFinished);
			const missing = path.join(harness.makeDirectory(), 'sbx.exe');
			const absent = await rejection(harness.runtime({ binaryPath: missing }).list());
			expect(absent.kind).toBe('binary-missing');
			expect(absent.message).toContain(missing);
			expect(absent.message).toContain('"binaryPath" option');

			const notSbx = path.join(harness.makeDirectory(), 'fake-sbx.mjs');
			fs.writeFileSync(notSbx, 'console.log("hello");\n');
			const unreadable = await rejection(harness.runtime({ binaryPath: notSbx }).list());
			expect(unreadable.kind).toBe('output-unparsable');
			expect(unreadable.message).toContain('Cannot read the sbx version');

			const down = world(onTestFinished, 'daemon-down');
			const daemon = await rejection(down.runtime.list());
			expect(daemon.kind).toBe('command-failed');
			expect(daemon.message).toContain('cannot connect to the sandbox daemon');
		}
	);

	it.concurrent(
		'reads settings, diagnose and the network policy through the same pinned runtime',
		async ({ onTestFinished }) => {
			const { harness, runtime } = world(onTestFinished);

			expect(await runtime.readSetting('ssh.agentForwardingEnabled')).toBe(true);
			expect(await runtime.readSetting('no.such.key')).toBeUndefined();
			expect((await runtime.readDiagnose()).checks.some(check => check.name === 'Authentication')).toBe(true);
			expect(await runtime.readNetworkPolicy()).toMatchObject({ mode: 'restricted' });
			expect(harness.calls().map(call => call.argv.join(' '))).toEqual([
				'version',
				'settings ls --json',
				'settings ls --json',
				'diagnose --json',
				'policy ls --json',
			]);
		}
	);
});
