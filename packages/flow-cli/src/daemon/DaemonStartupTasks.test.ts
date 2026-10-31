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
});
