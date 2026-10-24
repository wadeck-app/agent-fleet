import { type QueueClient, QueueFlowEventPublisher } from './QueueFlowEventPublisher';

function fakeClient(overrides: Partial<QueueClient> = {}): QueueClient & { calls: unknown[][] } {
	const calls: unknown[][] = [];
	return {
		calls,
		publish: (...args: unknown[]) => {
			calls.push(args);
		},
		flush: () => Promise.resolve(),
		status: () => Promise.resolve({ available: true, via: 'daemon' }),
		...overrides,
	};
}

describe('QueueFlowEventPublisher', () => {
	it('publishes with the execution project as cwd', () => {
		const client = fakeClient();
		new QueueFlowEventPublisher(client).publish('flow.step.started', {
			executionId: 'e1',
			flowId: 'f',
			status: 'running',
			projectRoot: '/work/p',
		});
		expect(client.calls).toEqual([
			[
				'flow.step.started',
				{ executionId: 'e1', flowId: 'f', status: 'running', projectRoot: '/work/p' },
				{ cwd: '/work/p' },
			],
		]);
	});

	it('does not pass a cwd when the event has no project', () => {
		const client = fakeClient();
		new QueueFlowEventPublisher(client).publish('flow.execution.started', {
			executionId: 'e1',
			flowId: 'f',
			status: 'running',
		});
		expect(client.calls[0]).toHaveLength(2);
	});

	it('delegates flush', async () => {
		const flush = vi.fn(() => Promise.resolve());
		await new QueueFlowEventPublisher(fakeClient({ flush })).flush();
		expect(flush).toHaveBeenCalledOnce();
	});

	it('reports an available queue as enabled, with how it is reached', async () => {
		const publisher = new QueueFlowEventPublisher(
			fakeClient({ status: () => Promise.resolve({ available: true, via: 'queue-start' }) })
		);
		expect(await publisher.status()).toEqual({ state: 'enabled', via: 'queue-start' });
	});

	it('reports an unavailable queue with the reason the SDK gives', async () => {
		const publisher = new QueueFlowEventPublisher(
			fakeClient({ status: () => Promise.resolve({ available: false, reason: 'queue is not on PATH' }) })
		);
		expect(await publisher.status()).toEqual({ state: 'unavailable', reason: 'queue is not on PATH' });
	});

	it('reports a status check that rejects as unavailable, naming the error', async () => {
		const publisher = new QueueFlowEventPublisher(fakeClient({ status: () => Promise.reject(new Error('kaput')) }));
		const status = await publisher.status();
		expect(status.state).toBe('unavailable');
		expect(JSON.stringify(status)).toContain('kaput');
	});
});
