import { FLOW_EVENT_CATALOG, type FlowEventDefinition } from 'flow-engine';

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
		registerEvents: () => Promise.resolve({ status: 'registered', count: 6 }),
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

	it('declares the whole catalog under the flow source and reports the count', async () => {
		const registerEvents = vi.fn((_source: string, _events: FlowEventDefinition[]) =>
			Promise.resolve({ status: 'registered' as const, count: 6 })
		);
		const declaration = await new QueueFlowEventPublisher(fakeClient({ registerEvents })).declareEvents();
		expect(declaration).toEqual({ state: 'registered', count: 6 });
		expect(registerEvents).toHaveBeenCalledOnce();
		expect(registerEvents).toHaveBeenCalledWith('flow', FLOW_EVENT_CATALOG);
	});

	it('passes the rejection problems through', async () => {
		const problems = [{ path: 'events[0].name', message: 'bad' }];
		const client = fakeClient({
			registerEvents: () => Promise.resolve({ status: 'rejected', reason: 'events[0].name: bad', problems }),
		});
		expect(await new QueueFlowEventPublisher(client).declareEvents()).toEqual({
			state: 'rejected',
			reason: 'events[0].name: bad',
			problems,
		});
	});

	it.each(['unsupported', 'dropped', 'unknown'] as const)('maps a %s answer with its reason', async status => {
		const client = fakeClient({ registerEvents: () => Promise.resolve({ status, reason: 'why ' + status }) });
		expect(await new QueueFlowEventPublisher(client).declareEvents()).toEqual({
			state: status,
			reason: 'why ' + status,
		});
	});

	it('says so when the SDK gives no reason for a failed declaration', async () => {
		const client = fakeClient({ registerEvents: () => Promise.resolve({ status: 'dropped' }) });
		const declaration = await new QueueFlowEventPublisher(client).declareEvents();
		expect(JSON.stringify(declaration)).toContain('gave no reason');
	});

	it('turns a registerEvents that throws into a dropped declaration naming the error', async () => {
		const client = fakeClient({ registerEvents: () => Promise.reject(new Error('kaput')) });
		const declaration = await new QueueFlowEventPublisher(client).declareEvents();
		expect(declaration.state).toBe('dropped');
		expect(JSON.stringify(declaration)).toContain('kaput');
	});
});

describe('QueueFlowEventPublisher with projectId', () => {
	it('still pushes with cwd = projectRoot and carries projectId in the payload', () => {
		const client = fakeClient();
		new QueueFlowEventPublisher(client).publish('flow.step.started', {
			executionId: 'e1',
			flowId: 'f',
			status: 'running',
			projectId: 'a1b2c3d4',
			projectRoot: '/work/p',
		});
		expect(client.calls).toEqual([
			[
				'flow.step.started',
				{ executionId: 'e1', flowId: 'f', status: 'running', projectId: 'a1b2c3d4', projectRoot: '/work/p' },
				{ cwd: '/work/p' },
			],
		]);
	});
});
