import type {
	FlowEventName,
	FlowEventPayload,
	FlowEventPublisher,
	FlowEventsDeclaration,
	FlowEventsStatus,
} from '../events/FlowEventPublisher';

export interface RecordedFlowEvent {
	event: FlowEventName;
	payload: FlowEventPayload;
}

/** Test double: keeps every published event, and can be told to fail like a broken publisher. */
export class RecordingFlowEventPublisher implements FlowEventPublisher {
	readonly events: RecordedFlowEvent[] = [];
	flushCount = 0;
	declareCount = 0;
	/** When set, publish() throws it and records nothing. */
	publishError: Error | undefined;
	/** When set, flush() rejects with it. */
	flushError: Error | undefined;

	publish(event: FlowEventName, payload: FlowEventPayload): void {
		if (this.publishError !== undefined) {
			throw this.publishError;
		}
		this.events.push({ event, payload });
	}

	flush(): Promise<void> {
		this.flushCount += 1;
		return this.flushError === undefined ? Promise.resolve() : Promise.reject(this.flushError);
	}

	status(): Promise<FlowEventsStatus> {
		return Promise.resolve({ state: 'enabled', via: 'daemon' });
	}

	declareEvents(): Promise<FlowEventsDeclaration> {
		this.declareCount += 1;
		return Promise.resolve({ state: 'registered', count: 6 });
	}

	names(): FlowEventName[] {
		return this.events.map(e => e.event);
	}
}
