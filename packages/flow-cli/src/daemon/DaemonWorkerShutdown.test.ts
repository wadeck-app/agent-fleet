import { awaitShutdownWork, shutDownWorkers } from './DaemonWorkerShutdown.js';

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
		} as never);

		expect(calls).toEqual(['announce', 'done', 'disconnect', 'close']);
	});
});
