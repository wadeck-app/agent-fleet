import { createLogger } from 'shared-common/logger';

const log = createLogger('EventSubscriptionRegistry');

/**
 * Identifies a flow trigger subscription from a worker
 */
export interface EventSubscription {
	/** The event name to listen for (e.g., 'ticket.status.changed') */
	event: string;
	/** Optional filter — all specified keys must match payload values */
	filter?: Record<string, string | undefined>;
	/** Worker that registered this subscription */
	workerId: string;
	/** Flow to execute when the event+filter matches */
	flowId: string;
	/** Project ID associated with this worker */
	projectId: string;
}

/**
 * Criteria for matching a dispatched event against registered subscriptions
 */
export interface EventDispatchCriteria {
	event: string;
	/**
	 * Optional project ID filter.
	 * When provided, only subscriptions whose projectId matches are returned.
	 * When omitted, all subscriptions for the event are returned regardless of project.
	 *
	 * NOTE: Workers register with projectId = package.json name (e.g. "agent-fleet"),
	 * while backend events carry DB-generated project IDs (e.g. "9zonezaue").
	 * In single-project-per-server deployments (current architecture), omit projectId
	 * since there is no cross-project leakage risk.
	 */
	projectId?: string;
	/** Payload fields to match against subscription filters */
	payload: Record<string, string | undefined>;
}

/**
 * ===========================================================================================
 * EVENT SUBSCRIPTION REGISTRY
 * ===========================================================================================
 *
 * Maintains subscriptions from workers for event-triggered flows.
 * When a worker registers flows that have `trigger.type: event`, those triggers
 * are stored here. When an internal event is emitted (e.g., via EventBus),
 * the registry finds all matching subscriptions so the orchestrator can
 * dispatch Tasks to the appropriate workers.
 *
 * Registration lifecycle:
 * 1. Worker connects → announces flows (including triggers)
 * 2. FlowDiscoveryRegistry calls `register()` for each triggered flow
 * 3. Worker disconnects → `unregisterWorker()` removes all subscriptions
 *
 * Dispatch lifecycle:
 * 1. TicketsService emits 'ticket.status.changed' to EventBus
 * 2. EventBus listener calls `findMatching()`
 * 3. Orchestrator creates Tasks for each matching subscription
 *
 * ===========================================================================================
 */
export class EventSubscriptionRegistry {
	private readonly subscriptions = new Map<string, EventSubscription[]>();

	/**
	 * Register a flow's event trigger subscription for a worker
	 */
	register(subscription: EventSubscription): void {
		const key = this.buildKey(subscription.workerId, subscription.flowId);
		if (!this.subscriptions.has(key)) {
			this.subscriptions.set(key, []);
		}
		const list = this.subscriptions.get(key)!;
		// Idempotent: replace existing entry for the same event (handles hot-reload re-registration)
		const existingIdx = list.findIndex(s => s.event === subscription.event);
		if (existingIdx >= 0) {
			list[existingIdx] = subscription;
		} else {
			list.push(subscription);
		}
		log.debug(
			`Registered event subscription: ${subscription.event} → ${subscription.flowId} (worker: ${subscription.workerId})`
		);
	}

	/**
	 * Remove all subscriptions registered by a specific worker (called on disconnect)
	 */
	unregisterWorker(workerId: string): void {
		for (const key of this.subscriptions.keys()) {
			if (key.startsWith(`${workerId}:`)) {
				this.subscriptions.delete(key);
			}
		}
		log.debug(`Unregistered all event subscriptions for worker: ${workerId}`);
	}

	/**
	 * Find all subscriptions that match the given event and payload
	 */
	findMatching(criteria: EventDispatchCriteria): EventSubscription[] {
		const matches: EventSubscription[] = [];

		for (const subscriptionList of this.subscriptions.values()) {
			for (const sub of subscriptionList) {
				if (sub.event !== criteria.event) continue;
				if (criteria.projectId !== undefined && sub.projectId !== criteria.projectId) continue;

				if (this.matchesFilter(sub.filter, criteria.payload)) {
					matches.push(sub);
				}
			}
		}

		return matches;
	}

	/**
	 * Get all registered subscriptions (for debugging/monitoring)
	 */
	getAll(): EventSubscription[] {
		return Array.from(this.subscriptions.values()).flat();
	}

	/**
	 * Check whether a filter matches a payload.
	 * All keys in the filter must be present and equal in the payload.
	 * Undefined filter values are treated as wildcards (matches any payload value).
	 */
	private matchesFilter(
		filter: Record<string, string | undefined> | undefined,
		payload: Record<string, string | undefined>
	): boolean {
		if (!filter) return true;

		for (const [key, value] of Object.entries(filter)) {
			if (value === undefined) continue;
			if (payload[key] !== value) return false;
		}

		return true;
	}

	private buildKey(workerId: string, flowId: string): string {
		return `${workerId}:${flowId}`;
	}
}
