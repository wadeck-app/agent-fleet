import { NullFlowEventPublisher } from './NullFlowEventPublisher';
import { QueueFlowEventPublisher } from './QueueFlowEventPublisher';
import { createFlowEventPublisher } from './createFlowEventPublisher';

describe('createFlowEventPublisher', () => {
	let lines: { level: string; message: string }[];
	const log = (level: 'info' | 'error', message: string): void => {
		lines.push({ level, message });
	};

	beforeEach(() => {
		lines = [];
	});

	it('is disabled, saying why, when FLOW_QUEUE_EVENTS=0', async () => {
		const publisher = createFlowEventPublisher({ FLOW_QUEUE_EVENTS: '0' }, log);
		expect(publisher).toBeInstanceOf(NullFlowEventPublisher);
		const status = await publisher.status();
		expect(status.state).toBe('disabled');
		expect(JSON.stringify(status)).toContain('FLOW_QUEUE_EVENTS=0');
	});

	it('publishes to the queue by default', () => {
		expect(createFlowEventPublisher({}, log)).toBeInstanceOf(QueueFlowEventPublisher);
		expect(lines).toEqual([]);
	});

	it('stays enabled but reports a value it does not understand, so a typo cannot go unnoticed', () => {
		const publisher = createFlowEventPublisher({ FLOW_QUEUE_EVENTS: 'off' }, log);
		expect(publisher).toBeInstanceOf(QueueFlowEventPublisher);
		expect(lines).toHaveLength(1);
		expect(lines[0]!.level).toBe('error');
		expect(lines[0]!.message).toContain('FLOW_QUEUE_EVENTS');
		expect(lines[0]!.message).toContain('"off"');
	});
});
