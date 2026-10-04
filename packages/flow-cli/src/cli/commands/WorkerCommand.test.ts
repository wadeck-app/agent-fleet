import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/FlowConfig', () => ({
	FlowConfigLoader: {
		loadForDaemon: () => ({ config: { worker: { wsPort: null }, queue: {}, limits: {}, workspace: {} } }),
	},
}));

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
	}),
	buildStepRunnerConfig: () => ({ interactive: false }),
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
});
