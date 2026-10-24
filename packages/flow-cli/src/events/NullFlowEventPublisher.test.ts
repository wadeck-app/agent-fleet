import { NullFlowEventPublisher } from './NullFlowEventPublisher';

describe('NullFlowEventPublisher', () => {
	it('declares nothing, saying why', async () => {
		const declaration = await new NullFlowEventPublisher('switched off').declareEvents();
		expect(declaration).toEqual({ state: 'not-declared', reason: 'switched off' });
	});
});
