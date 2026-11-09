import { DefaultProcessLauncher, type ProcessLauncher } from 'flow-engine';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { HostScriptEnvironment } from './HostScriptEnvironment';
import { HostScriptLauncher } from './HostScriptLauncher';

class RecordingLauncher implements ProcessLauncher {
	readonly isolatesEnvironment = false;
	readonly spawned: { command: string; args: readonly string[] | undefined; options: SpawnOptions }[] = [];
	readonly calls: string[] = [];

	spawn(command: string, argsOrOptions: readonly string[] | SpawnOptions, options?: SpawnOptions): ChildProcess {
		this.spawned.push(
			options === undefined
				? { command, args: undefined, options: argsOrOptions as SpawnOptions }
				: { command, args: argsOrOptions as readonly string[], options }
		);
		return {} as ChildProcess;
	}
	killTree(pid: number, signal: string): void {
		this.calls.push(`killTree ${pid} ${signal}`);
	}
	snapshotDescendants(pid: number): number[] {
		this.calls.push(`snapshotDescendants ${pid}`);
		return [7];
	}
	signalProcesses(pids: readonly number[], signal: string): void {
		this.calls.push(`signalProcesses ${pids.join(',')} ${signal}`);
	}
	lookupExecutable(command: string): string {
		this.calls.push(`lookupExecutable ${command}`);
		return 'found';
	}
	killTreeAndWait(): Promise<void> {
		this.calls.push('killTreeAndWait');
		return Promise.resolve();
	}
}

function launcherOver(
	inner: ProcessLauncher,
	declared: string[] = []
): { launcher: HostScriptLauncher; log: RecordingSandboxLog } {
	const log = new RecordingSandboxLog();
	return {
		launcher: new HostScriptLauncher({
			inner,
			environment: new HostScriptEnvironment(),
			declaredEnvironmentNames: new Set(declared),
			log,
		}),
		log,
	};
}

describe('HostScriptLauncher', () => {
	it('does not claim to isolate the environment: the shell is the machine own', () => {
		expect(launcherOver(new RecordingLauncher()).launcher.isolatesEnvironment).toBe(false);
	});

	it('spawns through the inner launcher with the environment filtered, in both spawn forms, and logs the drop by name only', () => {
		const inner = new RecordingLauncher();
		const { launcher, log } = launcherOver(inner, ['KEPT']);
		const env = { PATH: '/bin', KEPT: 'yes', FLOW_WORKER_TOKEN: 'launch-token', CANARY: 'canary' };

		launcher.spawn('bash', ['-c', 'echo'], { cwd: '/ws', env });
		launcher.spawn('echo hi', { shell: true, env });

		expect(inner.spawned.map(item => item.options.env)).toEqual([
			{ PATH: '/bin', KEPT: 'yes' },
			{ PATH: '/bin', KEPT: 'yes' },
		]);
		expect(inner.spawned[0]).toMatchObject({ command: 'bash', args: ['-c', 'echo'], options: { cwd: '/ws' } });
		expect(inner.spawned[1]).toMatchObject({ command: 'echo hi', options: { shell: true } });
		expect(log.text()).toContain('CANARY');
		expect(log.text()).not.toContain('launch-token');
		expect(log.text()).not.toContain('canary"');
	});

	it('delegates kill, snapshot, signal and lookup unchanged', async () => {
		const inner = new RecordingLauncher();
		const { launcher } = launcherOver(inner);

		launcher.killTree(5, 'SIGTERM');
		expect(launcher.snapshotDescendants(5)).toEqual([7]);
		launcher.signalProcesses([1, 2], 'SIGKILL');
		expect(launcher.lookupExecutable('where x')).toBe('found');
		await launcher.killTreeAndWait({} as ChildProcess);

		expect(inner.calls).toEqual([
			'killTree 5 SIGTERM',
			'snapshotDescendants 5',
			'signalProcesses 1,2 SIGKILL',
			'lookupExecutable where x',
			'killTreeAndWait',
		]);
	});

	it('a REAL process started through it sees no canary of the wrapper environment, only the baseline and the declared names', async () => {
		process.env['HOST_SCRIPT_CANARY'] = 'canary-value';
		try {
			const { launcher } = launcherOver(new DefaultProcessLauncher(), ['DECLARED_BY_STEP']);
			const child = launcher.spawn(
				process.execPath,
				['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'],
				{ env: { ...process.env, DECLARED_BY_STEP: 'x' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
			);
			const chunks: Buffer[] = [];
			child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
			await new Promise<void>((resolve, reject) => {
				child.on('error', reject);
				child.on('close', () => resolve());
			});

			const names = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as string[]).map(name =>
				name.toUpperCase()
			);
			expect(names).not.toContain('HOST_SCRIPT_CANARY');
			expect(names).toContain('DECLARED_BY_STEP');
			expect(names).toContain('PATH');
		} finally {
			delete process.env['HOST_SCRIPT_CANARY'];
		}
	});
});
