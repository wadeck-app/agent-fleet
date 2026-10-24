import { FlowCapabilitiesGenerator } from 'flow-engine';

import { FLOW_EVENT_NAMES } from './FlowEventPublisher';

describe('flow docs vs published events', () => {
	it('documents every event the daemon can publish, and no name starting with "before"', () => {
		const docs = new FlowCapabilitiesGenerator().generate();
		for (const name of FLOW_EVENT_NAMES) {
			expect(docs, `flow docs do not mention ${name}`).toContain(`\`${name}\``);
			expect(name.startsWith('before')).toBe(false);
		}
	});
});
