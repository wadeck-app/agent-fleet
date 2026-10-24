import { FLOW_EVENT_CATALOG, FLOW_EVENT_SOURCE, type FlowEventDefinition } from 'flow-engine';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type {
	FlowEventName,
	FlowEventPayload,
	FlowEventPublisher,
	FlowEventsDeclaration,
	FlowEventsStatus,
} from './FlowEventPublisher';

/** The part of the queue SDK's publisher this class uses (structurally the SDK's `QueuePublisher`). */
export interface QueueClient {
	publish(event: string, payload: unknown, options?: { cwd?: string }): void;
	flush(): Promise<void>;
	status(): Promise<{ available: boolean; via?: 'daemon' | 'queue-start'; reason?: string }>;
	registerEvents(
		source: string,
		events: FlowEventDefinition[]
	): Promise<{
		status: 'registered' | 'rejected' | 'unsupported' | 'dropped' | 'unknown';
		count?: number;
		problems?: { path: string; message: string }[];
		reason?: string;
	}>;
}

/** Publishes flow events through the queue SDK. The SDK reports its own failures; it never throws. */
export class QueueFlowEventPublisher implements FlowEventPublisher {
	constructor(private readonly client: QueueClient) {}

	publish(event: FlowEventName, payload: FlowEventPayload): void {
		// The project selects which `.queue/subscribers.yml` applies, so it travels as the push cwd.
		if (payload.projectRoot === undefined) {
			this.client.publish(event, payload);
		} else {
			this.client.publish(event, payload, { cwd: payload.projectRoot });
		}
	}

	flush(): Promise<void> {
		return this.client.flush();
	}

	async status(): Promise<FlowEventsStatus> {
		try {
			const status = await this.client.status();
			if (status.available) {
				return { state: 'enabled', via: status.via };
			}
			return { state: 'unavailable', reason: status.reason ?? 'the queue SDK gave no reason' };
		} catch (err) {
			return { state: 'unavailable', reason: `the queue status check failed: ${getErrorMessage(err)}` };
		}
	}

	async declareEvents(): Promise<FlowEventsDeclaration> {
		try {
			const result = await this.client.registerEvents(FLOW_EVENT_SOURCE, [...FLOW_EVENT_CATALOG]);
			const reason = result.reason ?? 'the queue SDK gave no reason';
			switch (result.status) {
				case 'registered':
					return { state: 'registered', count: result.count ?? FLOW_EVENT_CATALOG.length };
				case 'rejected':
					return { state: 'rejected', reason, problems: result.problems ?? [] };
				case 'unsupported':
				case 'dropped':
				case 'unknown':
					return { state: result.status, reason };
				default: {
					const unreachable: never = result.status;
					throw new Error(`Unknown declaration status: ${String(unreachable)}`);
				}
			}
		} catch (err) {
			return { state: 'dropped', reason: `the declaration call failed: ${getErrorMessage(err)}` };
		}
	}
}
