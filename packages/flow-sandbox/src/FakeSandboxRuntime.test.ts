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
});

describe('FakeSandboxRuntime exec', () => {
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
