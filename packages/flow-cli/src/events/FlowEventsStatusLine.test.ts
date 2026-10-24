import { flowEventsStatusLine } from './FlowEventsStatusLine';

describe('flowEventsStatusLine', () => {
	it('says events are published, and how the queue is reached', () => {
		const line = flowEventsStatusLine({ state: 'enabled', via: 'queue-start' });
		expect(line.level).toBe('info');
		expect(line.message).toContain('enabled');
		expect(line.message).toContain('queue-start');
	});

	it('tells an unavailable queue is an error with its reason and how to fix it', () => {
		const line = flowEventsStatusLine({ state: 'unavailable', reason: 'queue is not on PATH' });
		expect(line.level).toBe('error');
		expect(line.message).toContain('queue is not on PATH');
		expect(line.message).toContain('FLOW_QUEUE_EVENTS=0');
		expect(line.message).toContain('queue-cli');
	});

	it('states plainly that events are disabled and why', () => {
		const line = flowEventsStatusLine({ state: 'disabled', reason: 'FLOW_QUEUE_EVENTS=0 is set' });
		expect(line.level).toBe('info');
		expect(line.message).toContain('disabled');
		expect(line.message).toContain('FLOW_QUEUE_EVENTS=0 is set');
	});
});
