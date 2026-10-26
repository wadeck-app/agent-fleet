import { type FakeQueueDaemon, startFakeQueueDaemon } from '@wadeck-app/queue-sdk/testing';
import { FLOW_EVENT_CATALOG } from 'flow-engine';

import { flowEventsStatusLine } from './FlowEventsStatusLine';
import { createFlowEventPublisher } from './createFlowEventPublisher';

describe('createFlowEventPublisher: declaring the events to a queue daemon', () => {
	let daemon: FakeQueueDaemon;
	let lines: { level: string; message: string }[];
	const log = (level: 'info' | 'error', message: string): void => {
		lines.push({ level, message });
	};

	beforeEach(async () => {
		daemon = await startFakeQueueDaemon();
		lines = [];
	});

	afterEach(async () => {
		await daemon.close();
	});

	it('declares the catalog as the "flow" source, and the status line says so once', async () => {
		const publisher = createFlowEventPublisher({}, log, { configDir: daemon.configDir });
		const status = await publisher.status();
		const declaration = await publisher.declareEvents();
		const registrations = daemon.registrations();
		expect(registrations).toHaveLength(1);
		expect(registrations[0]!.source).toBe('flow');
		expect(registrations[0]!.events).toEqual(JSON.parse(JSON.stringify(FLOW_EVENT_CATALOG)));
		expect(declaration).toEqual({ state: 'registered', count: FLOW_EVENT_CATALOG.length });
		const line = flowEventsStatusLine(status, declaration);
		expect(line.level).toBe('info');
		expect(line.message).toContain('declared');
		// The SDK failure channel must not add a second line for the declaration.
		expect(lines).toEqual([]);
	});

	it('reports a rejected declaration through the result only, with the daemon paths', async () => {
		daemon.respondNextRegistration({
			status: 'rejected',
			reason: 'events[1].description: too long',
			problems: [{ path: 'events[1].description', message: 'too long' }],
		});
		const publisher = createFlowEventPublisher({}, log, { configDir: daemon.configDir });
		const declaration = await publisher.declareEvents();
		expect(declaration.state).toBe('rejected');
		expect(flowEventsStatusLine({ state: 'enabled', via: 'daemon' }, declaration).message).toContain(
			'events[1].description: too long'
		);
		expect(lines).toEqual([]);
	});

	it('reports a daemon older than 1.1.0 as unsupported, without a second log line', async () => {
		await daemon.close();
		daemon = await startFakeQueueDaemon({ protocolVersion: '1.0.0' });
		const publisher = createFlowEventPublisher({}, log, { configDir: daemon.configDir });
		const declaration = await publisher.declareEvents();
		expect(declaration.state).toBe('unsupported');
		expect(daemon.registrations()).toEqual([]);
		expect(lines).toEqual([]);
	});

	it('declares nothing and sends nothing with FLOW_QUEUE_EVENTS=0', async () => {
		const publisher = createFlowEventPublisher({ FLOW_QUEUE_EVENTS: '0' }, log, { configDir: daemon.configDir });
		expect((await publisher.declareEvents()).state).toBe('not-declared');
		publisher.publish('flow.step.started', { executionId: 'e', flowId: 'f', status: 'running' });
		await publisher.flush();
		expect(daemon.registrations()).toEqual([]);
		expect(daemon.pushes()).toEqual([]);
	});
});

describe('createFlowEventPublisher: the project of a pushed event', () => {
	let daemon: FakeQueueDaemon;
	const log = (): void => {};

	beforeEach(async () => {
		daemon = await startFakeQueueDaemon();
	});

	afterEach(async () => {
		await daemon.close();
	});

	it('sends the project id on the wire when the execution has one', async () => {
		const publisher = createFlowEventPublisher({}, log, { configDir: daemon.configDir });
		publisher.publish('flow.step.started', {
			executionId: 'e',
			flowId: 'f',
			status: 'running',
			projectId: 'a1b2c3d4',
			projectRoot: '/work/app',
		});
		await publisher.flush();
		expect(daemon.pushes().map(push => push.project)).toEqual(['a1b2c3d4']);
	});

	it('reports a queue daemon older than push protocol 1.2.0 instead of filing the event under another project', async () => {
		await daemon.close();
		daemon = await startFakeQueueDaemon({ protocolVersion: '1.1.0' });
		const failures: string[] = [];
		const publisher = createFlowEventPublisher({}, (_level, message) => failures.push(message), {
			configDir: daemon.configDir,
		});
		publisher.publish('flow.step.started', {
			executionId: 'e',
			flowId: 'f',
			status: 'running',
			projectId: 'a1b2c3d4',
		});
		await publisher.flush();
		expect(daemon.pushes()).toEqual([]);
		expect(failures.join('\n')).toContain('queue cli update');
	});
});
