import type {
	FlowEventName,
	FlowEventPayload,
	FlowEventPublisher,
	FlowEventsDeclaration,
	FlowEventsStatus,
} from './FlowEventPublisher';

/** Publishes nothing, and says why when asked. Used when events are switched off. */
export class NullFlowEventPublisher implements FlowEventPublisher {
	constructor(private readonly reason: string) {}

	publish(_event: FlowEventName, _payload: FlowEventPayload): void {
		// Switched off: nothing to publish.
	}

	flush(): Promise<void> {
		return Promise.resolve();
	}

	status(): Promise<FlowEventsStatus> {
		return Promise.resolve({ state: 'disabled', reason: this.reason });
	}

	declareEvents(): Promise<FlowEventsDeclaration> {
		return Promise.resolve({ state: 'not-declared', reason: this.reason });
	}
}
