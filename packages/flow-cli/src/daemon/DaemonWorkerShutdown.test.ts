import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import { awaitShutdownWork, shutDownWorkers } from './DaemonWorkerShutdown.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

describe('awaitShutdownWork -- what stop() waits for', () => {
	it('waits for the event flush AND for the workers (acks and releases), not for the first one only', async () => {
		let flushed!: () => void;
		let answered!: () => void;
		const flush = new Promise<void>(resolve => {
			flushed = resolve;
		});
		const workers = new Promise<void>(resolve => {
			answered = resolve;
		});
		let done = false;
		const waited = awaitShutdownWork(flush, workers).then(() => {
			done = true;
		});

		flushed();
		await new Promise<void>(resolve => setImmediate(resolve));
		expect(done).toBe(false);

		answered();
		await waited;
		expect(done).toBe(true);
	});
});

describe('shutDownWorkers -- order', () => {
	it('announces the stop before the done notice, the socket closes and the listener close', () => {
		const calls: string[] = [];
		const announced = Promise.resolve();
		shutDownWorkers({
			commandHandler: {
				announceDaemonStop: () => {
					calls.push('announce');
					return announced;
				},
			},
			workerRegistry: {
				broadcastToEphemeral: () => calls.push('done'),
				disconnectExternal: () => calls.push('disconnect'),
			},
			wsServer: { close: () => calls.push('close') },
			workerTypes: { disposeAll: () => Promise.resolve() },
		} as never);

		expect(calls).toEqual(['announce', 'done', 'disconnect', 'close']);
	});
});

describe('shutDownWorkers -- worker types', () => {
	const runtimeOf = (
		calls: string[],
		disposeAll: () => Promise<void>,
		announced: Promise<void> = Promise.resolve()
	) =>
		({
			commandHandler: {
				announceDaemonStop: () => {
					calls.push('announce');
					return announced;
				},
			},
			workerRegistry: { broadcastToEphemeral: () => {}, disconnectExternal: () => {} },
			wsServer: { close: () => {} },
			workerTypes: { disposeAll },
		}) as never;

	it('disposes the worker types only after the runs were announced and answered (their run hooks come first)', async () => {
		const calls: string[] = [];
		let answered!: () => void;
		const announced = new Promise<void>(resolve => {
			answered = resolve;
		});
		const done = shutDownWorkers(
			runtimeOf(
				calls,
				() => {
					calls.push('dispose');
					return Promise.resolve();
				},
				announced
			)
		);

		await new Promise<void>(resolve => setImmediate(resolve));
		expect(calls).toEqual(['announce']);

		answered();
		await done;
		expect(calls).toEqual(['announce', 'dispose']);
	});

	it('resolves once the worker types are disposed, so stop() waits for them', async () => {
		let disposed = false;
		const done = shutDownWorkers(
			runtimeOf([], async () => {
				await new Promise<void>(resolve => setImmediate(resolve));
				disposed = true;
			})
		);

		await done;

		expect(disposed).toBe(true);
	});

	it('disposes each real instance once when the hook runs twice (idle path, then stop)', async () => {
		const fixture = resetWorkerTypeFixture();
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		await workerTypes.get({
			sourceId: 'sandbox',
			provider: 'fixture',
			plugin: 'fixture-sandbox.sandbox',
			pluginsDir: FIXTURE_PLUGINS_DIR,
			labels: [],
			maxWorkers: 1,
			tokenHash: 'h',
			createdAt: '2026-10-27T00:00:00.000Z',
		});
		const runtime = {
			commandHandler: { announceDaemonStop: () => Promise.resolve() },
			workerRegistry: { broadcastToEphemeral: () => {}, disconnectExternal: () => {} },
			wsServer: { close: () => {} },
			workerTypes,
		} as never;

		await shutDownWorkers(runtime);
		await shutDownWorkers(runtime);

		expect(fixture.disposed).toEqual(['sandbox']);
	});

	it('still resolves when a worker type fails to dispose (logged by the instances, never thrown)', async () => {
		const fixture = resetWorkerTypeFixture();
		fixture.failDispose = true;
		const logged: string[] = [];
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), (_level, message) => logged.push(message));
		await workerTypes.get({
			sourceId: 'sandbox',
			provider: 'fixture',
			plugin: 'fixture-sandbox.sandbox',
			pluginsDir: FIXTURE_PLUGINS_DIR,
			labels: [],
			maxWorkers: 1,
			tokenHash: 'h',
			createdAt: '2026-10-27T00:00:00.000Z',
		});

		await expect(
			shutDownWorkers({
				commandHandler: { announceDaemonStop: () => Promise.resolve() },
				workerRegistry: { broadcastToEphemeral: () => {}, disconnectExternal: () => {} },
				wsServer: { close: () => {} },
				workerTypes,
			} as never)
		).resolves.toBeUndefined();
		expect(logged.join('\n')).toContain('fixture dispose failure');
	});
});

describe('shutDownWorkers -- the total cap', () => {
	const runtimeWith = (announced: Promise<void>, disposeAll: () => Promise<void>) =>
		({
			commandHandler: { announceDaemonStop: () => announced },
			workerRegistry: { broadcastToEphemeral: () => {}, disconnectExternal: () => {} },
			wsServer: { close: () => {} },
			workerTypes: { disposeAll },
		}) as never;

	it('stops waiting for acknowledgements that never come once the cap is reached, and says so', async () => {
		const exceeded = vi.fn();

		await shutDownWorkers(
			runtimeWith(new Promise<void>(() => {}), () => Promise.resolve()),
			30,
			exceeded
		);

		expect(exceeded).toHaveBeenCalledTimes(1);
		expect(exceeded).toHaveBeenCalledWith(30);
	});

	it('stops waiting for a dispose that never settles once the cap is reached, and says so', async () => {
		const exceeded = vi.fn();

		await shutDownWorkers(
			runtimeWith(Promise.resolve(), () => new Promise<void>(() => {})),
			30,
			exceeded
		);

		expect(exceeded).toHaveBeenCalledTimes(1);
	});

	it('says nothing when everything finished within the cap', async () => {
		const exceeded = vi.fn();

		await shutDownWorkers(
			runtimeWith(Promise.resolve(), () => Promise.resolve()),
			1_000,
			exceeded
		);

		expect(exceeded).not.toHaveBeenCalled();
	});
});
