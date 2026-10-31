import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonShutdownSequence, FORKED_WORKER_EXIT_GRACE_MS } from './DaemonShutdownSequence.js';

const { writeDaemonLog, removeWorkerPort, shutDownWorkers } = vi.hoisted(() => ({
	writeDaemonLog: vi.fn(),
	removeWorkerPort: vi.fn(),
	shutDownWorkers: vi.fn(() => Promise.resolve()),
}));
vi.mock('./DaemonLog.js', () => ({ writeDaemonLog }));
vi.mock('./publishWorkerPort.js', () => ({ removeWorkerPort }));
vi.mock('./DaemonWorkerShutdown.js', async importOriginal => ({
	...(await importOriginal<typeof import('./DaemonWorkerShutdown.js')>()),
	shutDownWorkers,
}));

function build(overrides: { runtime?: DaemonRuntime; port?: number; flush?: () => Promise<void> } = {}) {
	const calls: string[] = [];
	const sequence = new DaemonShutdownSequence({
		logsDir: 'logs',
		daemonDir: 'dir',
		workerAckTimeoutSeconds: 1,
		eventPublisher: { flush: overrides.flush ?? (() => Promise.resolve()) } as unknown as FlowEventPublisher,
		getRuntimeIfStarted: () => overrides.runtime,
		stopUpdateCheck: () => calls.push('updateCheck'),
		disposeIdleShutdown: () => calls.push('idle'),
		stopStalledSweep: () => calls.push('sweep'),
		terminateForkedWorkers: graceMs => calls.push(`terminate:${String(graceMs)}`),
		getWorkerListenerPort: () => overrides.port,
	});
	return { sequence, calls };
}

describe('DaemonShutdownSequence', () => {
	beforeEach(() => {
		writeDaemonLog.mockClear();
		removeWorkerPort.mockClear();
		shutDownWorkers.mockClear();
	});

	it('stops timers in order, then terminates forked workers after the grace', () => {
		const { sequence, calls } = build();
		sequence.run('idle');
		expect(calls).toEqual(['updateCheck', 'idle', 'sweep', `terminate:${String(FORKED_WORKER_EXIT_GRACE_MS)}`]);
	});

	it('logs who stopped the daemon except for idle, which logs its own line', () => {
		build().sequence.run('idle');
		expect(writeDaemonLog).not.toHaveBeenCalled();
		build().sequence.run('signal');
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'info',
			`Daemon stopped (signal) (pid ${String(process.pid)})`
		);
	});

	it('tells no workers when the start hook never built the components', () => {
		build().sequence.run('error');
		expect(shutDownWorkers).not.toHaveBeenCalled();
	});

	it('stops background work and shuts the workers down when components exist', () => {
		const stopBackgroundWork = vi.fn();
		const runtime = { commandHandler: { stopBackgroundWork } } as unknown as DaemonRuntime;
		build({ runtime }).sequence.run('command');
		expect(stopBackgroundWork).toHaveBeenCalledTimes(1);
		expect(shutDownWorkers).toHaveBeenCalledWith(runtime, expect.any(Number), expect.any(Function));
	});

	it('removes the worker port file only if a listener bound', () => {
		build().sequence.run('command');
		expect(removeWorkerPort).not.toHaveBeenCalled();
		build({ port: 4242 }).sequence.run('command');
		expect(removeWorkerPort).toHaveBeenCalledWith('dir', 4242);
	});

	it('logs a failed flush and still settles', async () => {
		const { sequence } = build({ flush: () => Promise.reject(new Error('queue down')) });
		sequence.run('command');
		await sequence.whenSettled();
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'error',
			'Queue events: flush at shutdown failed: Error: queue down'
		);
	});
});
