import { describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { SandboxError } from '../SandboxError';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { SandboxInnerWorkerLauncher } from './InnerWorkerLauncher';

async function runtimeWithSandbox(): Promise<FakeSandboxRuntime> {
	const runtime = new FakeSandboxRuntime({ clock: new FakeClock(Date.UTC(2026, 9, 27)) });
	await runtime.create({
		name: 'flow-sbx-h1-run1',
		agent: 'claude',
		mounts: [{ hostPath: process.platform === 'win32' ? 'C:\\w' : '/w' }],
		cpus: 2,
		memory: '2g',
	});
	return runtime;
}

describe('SandboxInnerWorkerLauncher', () => {
	it('runs the shim in the sandbox with the bridge environment and reports the exit code', async () => {
		const runtime = await runtimeWithSandbox();
		const log = new RecordingSandboxLog();
		const launcher = new SandboxInnerWorkerLauncher(runtime, log);

		const handle = launcher.launch({
			sandbox: 'flow-sbx-h1-run1',
			env: { FLOW_BRIDGE_URL: 'ws://x/', FLOW_BRIDGE_TOKEN: 'ph' },
		});

		expect(await handle.exited).toEqual({ exitCode: 0 });
		const exec = runtime.callsTo('exec')[0]?.request as { command: string[]; env: Record<string, string> };
		expect(exec.command).toEqual(['node', '/opt/flow/inner-bridge.cjs']);
		expect(exec.env).toEqual({ FLOW_BRIDGE_URL: 'ws://x/', FLOW_BRIDGE_TOKEN: 'ph' });
	});

	it('turns an exec failure into an exit record with the reason, never a rejection', async () => {
		const runtime = await runtimeWithSandbox();
		runtime.failNext('exec', new SandboxError('command-failed', 'the sandbox was stopped under the exec'));
		const launcher = new SandboxInnerWorkerLauncher(runtime, new RecordingSandboxLog());

		const handle = launcher.launch({ sandbox: 'flow-sbx-h1-run1', env: {} });

		expect(await handle.exited).toEqual({
			exitCode: undefined,
			error: 'the sandbox was stopped under the exec',
		});
	});

	it('writes the inner worker output to the wrapper log, line by line, prefixed with the sandbox', async () => {
		const runtime = await runtimeWithSandbox();
		runtime.setExecHandler(request => {
			request.onStdout?.('line one\nline two\n');
			request.onStderr?.('oops\n');
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const log = new RecordingSandboxLog();

		await new SandboxInnerWorkerLauncher(runtime, log).launch({ sandbox: 'flow-sbx-h1-run1', env: {} }).exited;

		expect(log.lines).toEqual([
			'info: [inner flow-sbx-h1-run1] line one',
			'info: [inner flow-sbx-h1-run1] line two',
			'warn: [inner flow-sbx-h1-run1] oops',
		]);
	});

	it('passes an abort signal that stop() fires', async () => {
		const runtime = await runtimeWithSandbox();
		let signal: AbortSignal | undefined;
		runtime.setExecHandler(request => {
			signal = request.signal;
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const handle = new SandboxInnerWorkerLauncher(runtime, new RecordingSandboxLog()).launch({
			sandbox: 'flow-sbx-h1-run1',
			env: {},
		});
		await handle.exited;

		handle.stop();

		expect(signal?.aborted).toBe(true);
	});
});
