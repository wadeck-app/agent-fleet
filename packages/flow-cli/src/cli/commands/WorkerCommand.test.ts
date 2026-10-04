import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable so individual tests (the opencode-env-defaults ones) can hand runWorker a config with
// an `opencode` section, while the startup-banner/list/update tests keep the plain default.
const hoistedState = vi.hoisted(() => ({
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	loadForDaemonConfig: { worker: { wsPort: null }, queue: {}, limits: {}, workspace: {}, opencode: {} } as any,
}));

vi.mock('../../config/FlowConfig', async () => {
	// applyOpenCodeEnvDefaults is kept real (not stubbed): this file's "opencode env defaults"
	// tests below exist specifically to prove runWorker wires it to this worker's OWN
	// process.env (the gap external, non-daemon-forked workers would otherwise have).
	const actual = await vi.importActual<typeof import('../../config/FlowConfig')>('../../config/FlowConfig');
	return {
		FlowConfigLoader: {
			DEFAULT: actual.FlowConfigLoader.DEFAULT,
			load: actual.FlowConfigLoader.load,
			loadForDaemon: () => ({ config: hoistedState.loadForDaemonConfig }),
			applyOpenCodeEnvDefaults: actual.FlowConfigLoader.applyOpenCodeEnvDefaults,
		},
	};
});

vi.mock('../../config/DefaultProjectResolver', () => ({
	DefaultProjectResolver: class {
		resolve(): { projectRoot: string } {
			return { projectRoot: '/fake/project' };
		}
	},
}));

vi.mock('../../config/PluginResolver', () => ({
	PluginResolver: {
		create: () => ({
			resolveApproval: async () => undefined,
			resolveApprovalByType: async () => undefined,
		}),
	},
}));

vi.mock('../../worker/WorkerLaunch', () => ({
	resolveSourceId: () => undefined,
	resolveWorkerToken: () => 'fake-token',
	resolveExtraProjects: () => [],
	buildRegistration: () => ({
		pid: 1234,
		labels: [],
		attachedProjects: ['/fake/project'],
		hasUserInterface: false,
		shellCapabilities: ['bash', 'cmd'],
	}),
	buildStepRunnerConfig: () => ({ interactive: false }),
	probeShellCapabilities: () => ['bash', 'cmd'],
	reconnectDelayMs: () => 500,
	resolveDaemonWsUrl: () => 'ws://127.0.0.1:9999',
	scheduleReconnectTimer: () => setTimeout(() => {}, 0),
	withFreshToken: (registration: unknown) => registration,
}));

vi.mock('../../worker/NudgeServer', () => ({
	NudgeServer: class {
		start(): Promise<string> {
			return Promise.resolve('http://127.0.0.1:1/nudge');
		}
		stop(): void {}
		onNotify(): void {}
	},
}));

vi.mock('../../worker/SelfDeclaration', () => ({
	declareSelf: () => undefined,
}));

vi.mock('../../worker/WorkerDisplay', () => ({
	WorkerDisplay: class {},
}));

vi.mock('../../worker/DaemonWatch', () => ({
	DaemonWatchNotifier: class {
		onNotify(): void {}
		stop(): void {}
	},
}));

vi.mock('ws', () => ({
	WebSocket: class {
		static OPEN = 1;
		readyState = 0;
		on(): void {}
		send(): void {}
	},
}));

import { registerWorkerCommand } from './WorkerCommand';
import { VERSION } from '../version.js';

describe('WorkerCommand verbose startup banner', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('prints a version line containing the current VERSION constant', async () => {
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker']);

		const allOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		const versionLine = allOutput.split('\n').find((line: string) => line.includes('version'));
		expect(versionLine).toBeDefined();
		expect(versionLine).toContain(VERSION);
	});

	// So an operator can see their own worker's declared shell capabilities immediately,
	// without waiting for `flow worker list` against the daemon.
	it('prints a shells line with the probed shell capabilities', async () => {
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker']);

		const allOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		const shellsLine = allOutput.split('\n').find((line: string) => line.includes('shells'));
		expect(shellsLine).toBeDefined();
		expect(shellsLine).toContain('bash');
		expect(shellsLine).toContain('cmd');
	});
});

describe('flow worker list — shells column', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	// `--json` already carries shellCapabilities via WorkerSummary (step A); this covers
	// the human-readable line printed by `flow worker list` without --json.
	it('includes a shells= column reflecting each worker declared capabilities', async () => {
		vi.resetModules();
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({
			DaemonNotRunningError: class DaemonNotRunningError extends Error {},
			createDaemonClient: () => ({
				send: async () =>
					Promise.resolve([
						{
							workerId: 'w1',
							pid: 1,
							state: 'idle',
							labels: [],
							attachedProjects: [],
							hasUserInterface: false,
							ephemeral: true,
							shellCapabilities: ['bash', 'pwsh'],
						},
						{
							workerId: 'w2',
							pid: 2,
							state: 'idle',
							labels: [],
							attachedProjects: [],
							hasUserInterface: false,
							ephemeral: true,
							shellCapabilities: [],
						},
					]),
			}),
		}));

		const { registerWorkerCommand: freshRegisterWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		freshRegisterWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker', 'list']);

		const allOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		expect(allOutput).toContain('shells=bash,pwsh');
		expect(allOutput).toContain('shells=-');
	});
});

describe('flow worker update', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit called');
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it('fails fast locally when neither --labels nor --shells is given, without contacting the daemon', async () => {
		vi.resetModules();
		const send = vi.fn();
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({
			DaemonNotRunningError: class DaemonNotRunningError extends Error {},
			createDaemonClient: () => ({ send }),
		}));

		const { registerWorkerCommand: freshRegisterWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		freshRegisterWorkerCommand(workerCommand);

		await expect(program.parseAsync(['node', 'test', 'worker', 'update', 'w1'])).rejects.toThrow();

		expect(send).not.toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(1);
		const errOutput = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		expect(errOutput).toContain('--labels');
		expect(errOutput).toContain('--shells');
	});

	it('fails fast locally on an unknown shell, without contacting the daemon', async () => {
		vi.resetModules();
		const send = vi.fn();
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({
			DaemonNotRunningError: class DaemonNotRunningError extends Error {},
			createDaemonClient: () => ({ send }),
		}));

		const { registerWorkerCommand: freshRegisterWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		freshRegisterWorkerCommand(workerCommand);

		await expect(
			program.parseAsync(['node', 'test', 'worker', 'update', 'w1', '--shells', 'sh'])
		).rejects.toThrow();

		expect(send).not.toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(1);
		const errOutput = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		expect(errOutput).toContain("Unknown shell(s) 'sh'");
		expect(errOutput).toContain('bash, cmd, pwsh');
	});

	it('sends workerId/labels/shellCapabilities to the daemon and prints the result', async () => {
		vi.resetModules();
		const send = vi.fn().mockResolvedValue({
			workerId: 'w1',
			pid: 1,
			state: 'idle',
			labels: ['npm'],
			attachedProjects: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: ['bash', 'pwsh'],
		});
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({
			DaemonNotRunningError: class DaemonNotRunningError extends Error {},
			createDaemonClient: () => ({ send }),
		}));

		const { registerWorkerCommand: freshRegisterWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		freshRegisterWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker', 'update', 'w1', '--labels', 'npm', '--shells', 'bash,pwsh']);

		expect(send).toHaveBeenCalledWith('updateWorker', {
			workerId: 'w1',
			labels: ['npm'],
			shellCapabilities: ['bash', 'pwsh'],
		});
		const allOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		expect(allOutput).toContain("Updated worker 'w1'");
		expect(allOutput).toContain('labels : npm');
		expect(allOutput).toContain('shells : bash, pwsh');
	});

	it('reports an actionable error when the daemon rejects the update (unknown workerId)', async () => {
		vi.resetModules();
		const send = vi.fn().mockRejectedValue(new Error('No connected worker has id "ghost". (none connected)'));
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({
			DaemonNotRunningError: class DaemonNotRunningError extends Error {},
			createDaemonClient: () => ({ send }),
		}));

		const { registerWorkerCommand: freshRegisterWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		freshRegisterWorkerCommand(workerCommand);

		await expect(
			program.parseAsync(['node', 'test', 'worker', 'update', 'ghost', '--labels', 'npm'])
		).rejects.toThrow();

		expect(exitSpy).toHaveBeenCalledWith(1);
		const errOutput = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
		expect(errOutput).toContain('No connected worker has id "ghost"');
	});
});

describe('flow worker — opencode env defaults (external, non-daemon-forked worker)', () => {
	// This worker process runs StepRunner/OpenCodeModelProvider in-process, reading its own
	// process.env -- it is never forked by the daemon, so it never inherits anything via
	// ForkWorkerSource.ts's env passthrough. runWorker must apply config.yml's opencode
	// defaults directly to this process's own env, same as the daemon does for its own.
	let tmpDir: string;
	let anthropicConfigPath: string;
	const defaultLoadForDaemonConfig = {
		worker: { wsPort: null },
		queue: {},
		limits: {},
		workspace: {},
		opencode: {},
	};

	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-opencode-env-test-'));
		anthropicConfigPath = path.join(tmpDir, 'config_claude.json');
		fs.writeFileSync(anthropicConfigPath, '{}', 'utf8');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
		hoistedState.loadForDaemonConfig = defaultLoadForDaemonConfig;
		delete process.env['OPENCODE_CONFIG_ANTHROPIC'];
	});

	it("sets this worker's own OPENCODE_CONFIG_ANTHROPIC from config.yml when no env var is already set", async () => {
		delete process.env['OPENCODE_CONFIG_ANTHROPIC'];
		hoistedState.loadForDaemonConfig = {
			...defaultLoadForDaemonConfig,
			opencode: { configAnthropic: anthropicConfigPath, configOpenai: undefined },
		};

		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker']);

		expect(process.env['OPENCODE_CONFIG_ANTHROPIC']).toBe(anthropicConfigPath);
	});

	it("does NOT override an operator-set OPENCODE_CONFIG_ANTHROPIC on this worker's own env", async () => {
		process.env['OPENCODE_CONFIG_ANTHROPIC'] = '/operator/own-config.json';
		hoistedState.loadForDaemonConfig = {
			...defaultLoadForDaemonConfig,
			opencode: { configAnthropic: anthropicConfigPath, configOpenai: undefined },
		};

		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);

		await program.parseAsync(['node', 'test', 'worker']);

		expect(process.env['OPENCODE_CONFIG_ANTHROPIC']).toBe('/operator/own-config.json');
	});
});
