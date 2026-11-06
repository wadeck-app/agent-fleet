import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { SandboxError } from './SandboxError';
import type { CreateSandboxRequest } from './SandboxRuntime';
import { rejectionOf } from './testing/ExpectedFailures';
import { describeSandboxRuntimeContract } from './testing/SandboxRuntimeContract';

describeSandboxRuntimeContract('FakeSandboxRuntime', () => ({
	runtime: new FakeSandboxRuntime({ clock: new FakeClock() }),
	dispose: () => undefined,
}));

const request: CreateSandboxRequest = {
	name: 'fake-1',
	agent: 'shell',
	mounts: [{ hostPath: '/work/ws' }, { hostPath: '/work/ws.meta', readOnly: true }],
	cpus: 2,
	memory: '2g',
	image: 'flow-sandbox:test',
};

function fake(start = 1_000): { runtime: FakeSandboxRuntime; clock: FakeClock } {
	const clock = new FakeClock(start);
	return { runtime: new FakeSandboxRuntime({ clock }), clock };
}

describe('FakeSandboxRuntime recording and time', () => {
	it('records every call in order with the fake clock reading, including calls that fail', async () => {
		const { runtime, clock } = fake(5_000);

		await runtime.create(request);
		clock.advance(60_000);
		await runtime.stop('fake-1');
		clock.advance(1);
		await runtime.stop('ghost-1').catch(() => undefined);

		expect(runtime.calls.map(call => [call.method, call.at])).toEqual([
			['create', 5_000],
			['stop', 65_000],
			['stop', 65_001],
		]);
		expect(runtime.callsTo('stop').map(call => call.request)).toEqual(['fake-1', 'ghost-1']);
	});

	it('stamps creation and last activity from the fake clock, keeps mounts, limits and image, and reports read-only mounts as workspaces', async () => {
		const { runtime, clock } = fake(Date.UTC(2026, 9, 26));

		await runtime.create(request);
		clock.advance(90_000);
		await runtime.exec({ sandbox: 'fake-1', command: ['true'] });

		const state = runtime.state('fake-1');
		expect(state.lastActivityAt - state.createdAt).toBe(90_000);
		expect(state).toMatchObject({ cpus: 2, memory: '2g', image: 'flow-sandbox:test', agent: 'shell' });
		const [listed] = await runtime.list();
		expect(listed?.createdAt).toBe('2026-10-26T00:00:00.000Z');
		expect(listed?.workspaces).toEqual(['/work/ws', '/work/ws.meta']);
	});

	it('state() throws for an unknown sandbox instead of returning nothing', () => {
		const { runtime } = fake();

		expect(() => runtime.state('ghost-1')).toThrow('FakeSandboxRuntime has no sandbox "ghost-1" (existing: none)');
		expect(runtime.has('ghost-1')).toBe(false);
	});
});

describe('FakeSandboxRuntime stop, idle and files', () => {
	it('simulates the idle stop (an exec restarts the sandbox), and drops rules, secrets and files with the sandbox', async () => {
		const { runtime } = fake();
		await runtime.create(request);

		runtime.simulateIdleStop('fake-1');
		expect(runtime.state('fake-1').status).toBe('stopped');
		await runtime.exec({ sandbox: 'fake-1', command: ['true'] });
		expect(runtime.state('fake-1').status).toBe('running');

		await runtime.allowNetwork({ sandbox: 'fake-1', resources: ['localhost:19001'] });
		await runtime.setSecret({
			sandbox: 'fake-1',
			hosts: ['localhost'],
			envVar: 'T',
			placeholder: 'placeholder-1',
			valueCommand: 'echo s',
		});
		await runtime.setServiceSecret({ sandbox: 'fake-1', service: 'openai', value: 'sk-test' });
		expect([...runtime.state('fake-1').networkRules]).toEqual(['localhost:19001']);
		expect([...runtime.state('fake-1').secrets.keys()]).toEqual(['placeholder-1']);
		expect([...runtime.state('fake-1').serviceSecrets]).toEqual([['openai', 'sk-test']]);

		await runtime.remove('fake-1');
		await runtime.create(request);

		expect(runtime.state('fake-1').networkRules.size).toBe(0);
		expect(runtime.state('fake-1').secrets.size).toBe(0);
		expect(runtime.state('fake-1').serviceSecrets.size).toBe(0);
	});

	it('serves copyOut for a seeded or copied-in file only', async () => {
		const { runtime } = fake();
		await runtime.create(request);
		runtime.seedFile('fake-1', '/home/agent/seeded.txt');
		await runtime.copyIn({ sandbox: 'fake-1', hostPath: '/work/in', sandboxPath: '/home/agent/in' });

		await runtime.copyOut({ sandbox: 'fake-1', sandboxPath: '/home/agent/seeded.txt', hostPath: '/work/out1' });
		await runtime.copyOut({ sandbox: 'fake-1', sandboxPath: '/home/agent/in', hostPath: '/work/out2' });

		expect(runtime.state('fake-1').files.get('/home/agent/in')).toBe('host:/work/in');
		const error = await rejectionOf(
			SandboxError,
			runtime.copyOut({ sandbox: 'fake-1', sandboxPath: '/home/agent/none', hostPath: '/work/out3' })
		);
		expect(error.message).toContain('no such file or directory in sandbox "fake-1"');
	});
});

describe('FakeSandboxRuntime exec', () => {
	it('succeeds with empty output by default and lets a handler decide, set later or through the constructor, with streaming', async () => {
		const { runtime } = fake();
		await runtime.create(request);
		expect(await runtime.exec({ sandbox: 'fake-1', command: ['anything'] })).toEqual({
			exitCode: 0,
			stdout: '',
			stderr: '',
		});

		runtime.setExecHandler((execRequest, context) => {
			context.emitStdout('one\n');
			context.emitStderr('warn\n');
			return {
				exitCode: 3,
				stdout: `ran ${execRequest.command.join(' ')} with ${JSON.stringify(execRequest.env)} in ${execRequest.cwd} stdin=${String(execRequest.stdin)}`,
				stderr: '',
			};
		});
		const out: string[] = [];
		const err: string[] = [];
		const result = await runtime.exec({
			sandbox: 'fake-1',
			command: ['run', 'x'],
			env: { A: '1' },
			cwd: '/c/ws',
			stdin: 'in',
			onStdout: text => out.push(text),
			onStderr: text => err.push(text),
		});

		expect(result).toEqual({ exitCode: 3, stdout: 'ran run x with {"A":"1"} in /c/ws stdin=in', stderr: '' });
		expect(out).toEqual(['one\n']);
		expect(err).toEqual(['warn\n']);

		const injected = new FakeSandboxRuntime({
			clock: new FakeClock(),
			execHandler: () => ({ exitCode: 9, stdout: '', stderr: 'no' }),
		});
		await injected.create(request);
		expect((await injected.exec({ sandbox: 'fake-1', command: ['x'] })).exitCode).toBe(9);
	});

	it('rejects with aborted when the signal fires while the command is pending (the sandbox keeps running) or is already aborted (the handler never runs)', async () => {
		const { runtime } = fake();
		await runtime.create(request);
		runtime.setExecHandler(() => new Promise(() => undefined));
		const controller = new AbortController();

		const pending = runtime.exec({ sandbox: 'fake-1', command: ['hang'], signal: controller.signal });
		controller.abort();
		const error = await rejectionOf(SandboxError, pending);

		expect(error.kind).toBe('aborted');
		expect(error.message).toContain('does NOT stop a process already running inside the sandbox');
		expect(runtime.state('fake-1').status).toBe('running');

		let ran = false;
		runtime.setExecHandler(() => {
			ran = true;
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const early = await rejectionOf(
			SandboxError,
			runtime.exec({ sandbox: 'fake-1', command: ['x'], signal: controller.signal })
		);

		expect(early.kind).toBe('aborted');
		expect(ran).toBe(false);
	});

	it('passes a handler failure through (wrapping a non-Error rejection), and keeps working with a signal that never fires', async () => {
		const { runtime } = fake();
		await runtime.create(request);
		const controller = new AbortController();
		runtime.setExecHandler(() => {
			throw new Error('handler exploded');
		});

		const error = await rejectionOf(
			Error,
			runtime.exec({ sandbox: 'fake-1', command: ['x'], signal: controller.signal })
		);
		expect(error).toEqual(new Error('handler exploded'));

		runtime.setExecHandler(() => Promise.reject('plain text'));
		expect(
			await rejectionOf(Error, runtime.exec({ sandbox: 'fake-1', command: ['x'], signal: controller.signal }))
		).toEqual(new Error('plain text'));

		runtime.setExecHandler(() => ({ exitCode: 0, stdout: 'fine', stderr: '' }));
		expect((await runtime.exec({ sandbox: 'fake-1', command: ['x'], signal: controller.signal })).stdout).toBe(
			'fine'
		);
	});
});

describe('FakeSandboxRuntime failure injection', () => {
	const boom = new SandboxError('command-failed', 'injected');

	it('fails the next call to a method once, after recording it, then works again; several times and only when the request matches', async () => {
		const { runtime } = fake();
		runtime.failNext('create', boom);

		expect(await rejectionOf(SandboxError, runtime.create(request))).toBe(boom);
		expect(runtime.has('fake-1')).toBe(false);
		await runtime.create(request);
		expect(runtime.callsTo('create')).toHaveLength(2);
		expect(runtime.has('fake-1')).toBe(true);

		runtime.failNext('stop', boom, { times: 2, when: name => name === 'fake-1' });
		await runtime.create({ ...request, name: 'fake-2' });

		await runtime.stop('fake-2');
		expect(await rejectionOf(SandboxError, runtime.stop('fake-1'))).toBe(boom);
		expect(await rejectionOf(SandboxError, runtime.stop('fake-1'))).toBe(boom);
		await runtime.stop('fake-1');

		expect(runtime.state('fake-1').status).toBe('stopped');
	});
});
