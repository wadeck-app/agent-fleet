import { describe, expect, it } from 'vitest';

import { FIRST_SYNTHETIC_PID, SandboxChildProcess } from './SandboxChildProcess';

function create(overrides: Partial<ConstructorParameters<typeof SandboxChildProcess>[0]> = {}): {
	child: SandboxChildProcess;
	kills: string[];
} {
	const kills: string[] = [];
	const child = new SandboxChildProcess({
		pid: FIRST_SYNTHETIC_PID,
		command: 'bash',
		args: ['-c', 'true'],
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
		onKill: signal => kills.push(signal),
		...overrides,
	});
	return { child, kills };
}

describe('SandboxChildProcess input', () => {
	it('hands over what was written once end() was called', async () => {
		const { child } = create();
		child.stdin?.write('hello ');
		child.stdin?.end('world');
		expect((await child.takeInput(1000))?.toString()).toBe('hello world');
	});

	it('returns undefined and fails later writes loudly when stdin is left open', async () => {
		const { child } = create();
		child.stdin?.write('partial');
		expect(await child.takeInput(10)).toBeUndefined();
		const failure = await new Promise<Error>(resolve => {
			child.stdin?.once('error', resolve);
			child.stdin?.write('too late');
		});
		expect(failure.message).toMatch(/takes its standard input once, at start/);
	});

	it('has no stdin when ignored', async () => {
		const { child } = create({ stdin: 'ignore' });
		expect(child.stdin).toBeNull();
		expect(await child.takeInput(10)).toBeUndefined();
	});
});

describe('SandboxChildProcess exit', () => {
	it('emits exit then close with the exit code, after the output was read', async () => {
		const { child } = create();
		const events: string[] = [];
		let stdout = '';
		child.stdout?.on('data', (data: Buffer) => (stdout += data.toString()));
		child.on('exit', (code: number | null) => events.push(`exit:${code}`));
		child.on('close', (code: number | null) => events.push(`close:${code}:${stdout}`));
		child.pushStdout('line 1\n');
		child.pushStdout('line 2\n');
		await child.finish({ code: 3, signal: null });
		expect(events).toEqual(['exit:3', 'close:3:line 1\nline 2\n']);
		expect(child.exitCode).toBe(3);
		expect(child.signalCode).toBeNull();
		expect(child.isFinished).toBe(true);
	});

	it('drains a stream nobody reads so close is not blocked', async () => {
		const { child } = create();
		child.pushStderr('ignored');
		await child.finish({ code: 0, signal: null });
		expect(child.exitCode).toBe(0);
	});

	it('records the signal of a process that was ended', async () => {
		const { child } = create();
		await child.finish({ code: null, signal: 'SIGKILL' });
		expect(child.exitCode).toBeNull();
		expect(child.signalCode).toBe('SIGKILL');
	});

	it('finishes only once', async () => {
		const { child } = create();
		const closes: unknown[] = [];
		child.on('close', code => closes.push(code));
		await child.finish({ code: 0, signal: null });
		await child.finish({ code: 9, signal: null });
		expect(closes).toEqual([0]);
		expect(child.exitCode).toBe(0);
	});

	it('emits error then close for a failed start', async () => {
		const { child } = create();
		const events: string[] = [];
		child.on('error', (error: Error) => events.push(`error:${error.message}`));
		child.on('close', (code: number | null) => events.push(`close:${code}`));
		await child.fail(new Error('cannot stage'));
		expect(events).toEqual(['error:cannot stage', 'close:null']);
	});

	it('does not throw when nobody listens for error: the reason goes to stderr and the exit code is 1', async () => {
		const { child } = create();
		let stderr = '';
		child.stderr?.on('data', (data: Buffer) => (stderr += data.toString()));
		await child.fail(new Error('cannot stage'));
		expect(stderr).toContain('cannot stage');
		expect(child.exitCode).toBe(1);
	});
});

describe('SandboxChildProcess kill', () => {
	it('asks the launcher to end it, with SIGTERM by default and SIGKILL when asked', () => {
		const { child, kills } = create();
		expect(child.kill()).toBe(true);
		child.kill('SIGKILL');
		expect(kills).toEqual(['SIGTERM', 'SIGKILL']);
		expect(child.killed).toBe(true);
	});

	it('does nothing once finished', async () => {
		const { child, kills } = create();
		await child.finish({ code: 0, signal: null });
		expect(child.kill()).toBe(false);
		expect(kills).toEqual([]);
	});
});
