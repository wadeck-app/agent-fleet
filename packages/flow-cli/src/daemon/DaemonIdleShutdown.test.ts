import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DaemonIdleShutdown, SHUTDOWN_GRACE_MS } from './DaemonIdleShutdown.js';
import type { DaemonRuntime } from './DaemonRuntime.js';

describe('DaemonIdleShutdown', () => {
	let logsDir: string;
	let idle: boolean;
	let stopPeriodicWork: Mock<() => void>;
	let stopDaemon: Mock<() => Promise<void>>;
	let wsClose: Mock<() => void>;
	let shutdown: DaemonIdleShutdown;

	const logLines = (): string[] =>
		fs
			.readdirSync(logsDir)
			.flatMap(f => fs.readFileSync(path.join(logsDir, f), 'utf8').trim().split('\n'))
			.map(line => (JSON.parse(line) as { msg: string }).msg);

	beforeEach(() => {
		vi.useFakeTimers();
		logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-idle-shutdown-'));
		idle = true;
		stopPeriodicWork = vi.fn<() => void>();
		stopDaemon = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		wsClose = vi.fn<() => void>();
		const runtime = {
			commandHandler: {
				isQueueEmpty: () => idle,
				hasActiveExecutions: () => false,
				hasResumableInterventions: () => false,
				describeIdleState: () => 'state',
				stopBackgroundWork: vi.fn(),
			},
			workerRegistry: {
				hasBusyWorkers: () => false,
				liveCount: 0,
				idleCount: 0,
				broadcastToEphemeral: vi.fn(),
				disconnectExternal: vi.fn(),
			},
			wsServer: { close: wsClose },
		} as unknown as DaemonRuntime;
		shutdown = new DaemonIdleShutdown(logsDir, () => runtime, stopPeriodicWork, stopDaemon);
	});

	afterEach(() => {
		vi.useRealTimers();
		fs.rmSync(logsDir, { recursive: true, force: true });
	});

	it('stops the daemon only after the grace period, once', () => {
		shutdown.checkShutdown();
		shutdown.checkShutdown();
		vi.advanceTimersByTime(SHUTDOWN_GRACE_MS - 1);
		expect(stopDaemon).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		shutdown.checkShutdown();

		expect(stopDaemon).toHaveBeenCalledTimes(1);
		expect(stopDaemon).toHaveBeenCalledWith();
		expect(stopPeriodicWork).toHaveBeenCalledTimes(1);
		expect(wsClose).toHaveBeenCalledTimes(1);
		expect(logLines().filter(msg => msg.startsWith('Idle detected'))).toHaveLength(1);
		expect(logLines().some(msg => msg.startsWith(`Daemon stopped (idle) (pid ${String(process.pid)})`))).toBe(true);
	});

	it('cancels the schedule when work arrives before the grace period ends', () => {
		shutdown.checkShutdown();
		idle = false;
		shutdown.checkShutdown();
		vi.advanceTimersByTime(SHUTDOWN_GRACE_MS * 2);

		expect(stopDaemon).not.toHaveBeenCalled();
		expect(logLines().some(msg => msg.startsWith('Idle shutdown cancelled'))).toBe(true);
	});

	it('re-checks idleness when the grace period elapses', () => {
		shutdown.checkShutdown();
		idle = false;
		vi.advanceTimersByTime(SHUTDOWN_GRACE_MS);

		expect(stopDaemon).not.toHaveBeenCalled();
		expect(logLines().some(msg => msg.startsWith('Idle shutdown skipped on recheck'))).toBe(true);
	});
});
