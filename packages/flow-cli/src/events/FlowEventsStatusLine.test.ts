import { flowEventsStatusLine } from './FlowEventsStatusLine';

describe('flowEventsStatusLine', () => {
	const enabled = { state: 'enabled', via: 'daemon' } as const;

	it('says events are published, how the queue is reached, and that they are declared', () => {
		const line = flowEventsStatusLine({ state: 'enabled', via: 'queue-start' }, { state: 'registered', count: 6 });
		expect(line.level).toBe('info');
		expect(line.message).toContain('enabled');
		expect(line.message).toContain('queue-start');
		expect(line.message).toContain('declared to the queue (6 events');
	});

	it('tells an unavailable queue is an error with its reason and how to fix it', () => {
		const line = flowEventsStatusLine({ state: 'unavailable', reason: 'queue is not on PATH' }, undefined);
		expect(line.level).toBe('error');
		expect(line.message).toContain('queue is not on PATH');
		expect(line.message).toContain('FLOW_QUEUE_EVENTS=0');
		expect(line.message).toContain('queue-cli');
	});

	it('states plainly that events are disabled and why', () => {
		const line = flowEventsStatusLine({ state: 'disabled', reason: 'FLOW_QUEUE_EVENTS=0 is set' }, undefined);
		expect(line.level).toBe('info');
		expect(line.message).toContain('disabled');
		expect(line.message).toContain('FLOW_QUEUE_EVENTS=0 is set');
	});

	it('is an error naming each rejected path and the fix when the queue refuses the declaration', () => {
		const line = flowEventsStatusLine(enabled, {
			state: 'rejected',
			reason: 'events[2].schema: too big',
			problems: [
				{ path: 'events[2].schema', message: 'too big' },
				{ path: 'events[4].name', message: 'bad name' },
			],
		});
		expect(line.level).toBe('error');
		expect(line.message).toContain('events[2].schema: too big');
		expect(line.message).toContain('events[4].name: bad name');
		expect(line.message).toContain('FlowEventCatalog');
		expect(line.message).toContain('still published');
	});

	it('names the reason when the queue refused without listing problems', () => {
		const line = flowEventsStatusLine(enabled, { state: 'rejected', reason: 'protocol mismatch', problems: [] });
		expect(line.message).toContain('protocol mismatch');
	});

	it('is an error telling to update the queue when its daemon predates protocol 1.1.0', () => {
		const line = flowEventsStatusLine(enabled, { state: 'unsupported', reason: 'daemon speaks 1.0.0' });
		expect(line.level).toBe('error');
		expect(line.message).toContain('older than 1.1.0');
		expect(line.message).toContain('queue cli update');
	});

	it.each(['dropped', 'unknown'] as const)('is an error giving the SDK reason when the declaration is %s', state => {
		const line = flowEventsStatusLine(enabled, { state, reason: 'because of X' });
		expect(line.level).toBe('error');
		expect(line.message).toContain(state);
		expect(line.message).toContain('because of X');
	});

	it('does not mention a declaration when none was attempted', () => {
		expect(flowEventsStatusLine(enabled, undefined).message).not.toContain('declar');
	});
});
