import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import type { ExecutionStore } from '../storage/ExecutionStore';
import { DaemonStartupTasks } from './DaemonStartupTasks.js';

const { writeDaemonLog, registerAppCoreModules } = vi.hoisted(() => ({
	writeDaemonLog: vi.fn(),
	registerAppCoreModules: vi.fn(() => Promise.resolve()),
}));
vi.mock('./DaemonLog.js', () => ({ writeDaemonLog }));
vi.mock('./registerAppCoreModules.js', () => ({ registerAppCoreModules }));

const publisher = {} as FlowEventPublisher;
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

describe('DaemonStartupTasks', () => {
	beforeEach(() => {
		writeDaemonLog.mockClear();
		registerAppCoreModules.mockClear();
	});

	it('does not contact app-core when no module is given', () => {
		const tasks = new DaemonStartupTasks('logs', publisher);
		tasks.registerWithAppCore(undefined);
		tasks.registerWithAppCore([]);
		expect(registerAppCoreModules).not.toHaveBeenCalled();
	});

	it('registers the given modules with the logs directory', () => {
		const modules = [{ id: 'flow', manifestPath: 'm.json' }];
		new DaemonStartupTasks('logs', publisher).registerWithAppCore(modules);
		expect(registerAppCoreModules).toHaveBeenCalledWith(modules, 'logs');
	});

	it('reconciles synchronously and logs the count', () => {
		const store = {
			pruneOldExecutionsInBackground: () => Promise.resolve(),
			reconcileInterruptedExecutions: () => 3,
		} as unknown as ExecutionStore;
		new DaemonStartupTasks('logs', publisher).pruneAndReconcile(store);
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'info',
			'Reconciled 3 execution(s) interrupted by a previous daemon stop (marked failed; re-run with flow run)'
		);
	});

	it('logs a failed background pruning instead of dropping it', async () => {
		const store = {
			pruneOldExecutionsInBackground: () => Promise.reject(new Error('disk gone')),
			reconcileInterruptedExecutions: () => 0,
		} as unknown as ExecutionStore;
		new DaemonStartupTasks('logs', publisher).pruneAndReconcile(store);
		await settle();
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'error',
			'[warn] execution pruning failed: Error: disk gone'
		);
	});

	it('logs one events status line and declares nothing when the queue is not enabled', async () => {
		const events = {
			status: () => Promise.resolve({ state: 'disabled', reason: 'no queue' }),
			declareEvents: vi.fn(),
		} as unknown as FlowEventPublisher;
		new DaemonStartupTasks('logs', events).logEventsStatus();
		await settle();
		expect(writeDaemonLog).toHaveBeenCalledTimes(1);
		expect(events.declareEvents).not.toHaveBeenCalled();
	});

	describe('resumeWaitingExecutions', () => {
		it('starts the waiting runs again and says how many in the daemon log', async () => {
			const resume = vi.fn(() => Promise.resolve());
			const store = { waitingExecutionIdsAtStart: () => ['aaaa1111', 'bbbb2222'] } as unknown as ExecutionStore;
			const hooksFor = () => undefined;

			new DaemonStartupTasks('logs', publisher).resumeWaitingExecutions(
				store,
				{ resumeWaitingExecutions: resume },
				hooksFor
			);
			await settle();

			expect(resume).toHaveBeenCalledWith(hooksFor);
			expect(writeDaemonLog).toHaveBeenCalledWith(
				'logs',
				'info',
				'2 execution(s) were waiting for a workspace when the previous daemon stopped: starting them again, in arrival order'
			);
		});

		it('says nothing and starts nothing when no run was waiting', async () => {
			const resume = vi.fn(() => Promise.resolve());
			const store = { waitingExecutionIdsAtStart: () => [] } as unknown as ExecutionStore;

			new DaemonStartupTasks('logs', publisher).resumeWaitingExecutions(
				store,
				{ resumeWaitingExecutions: resume },
				() => undefined
			);
			await settle();

			expect(resume).not.toHaveBeenCalled();
			expect(writeDaemonLog).not.toHaveBeenCalled();
		});

		it('logs a failure to start them again as an error that names the consequence', async () => {
			const store = { waitingExecutionIdsAtStart: () => ['aaaa1111'] } as unknown as ExecutionStore;
			const resume = vi.fn(() => Promise.reject(new Error('registry unreadable')));

			new DaemonStartupTasks('logs', publisher).resumeWaitingExecutions(
				store,
				{ resumeWaitingExecutions: resume },
				() => undefined
			);
			await settle();

			expect(writeDaemonLog).toHaveBeenCalledWith(
				'logs',
				'error',
				expect.stringContaining('could not start the waiting executions again: Error: registry unreadable')
			);
		});
	});
});
