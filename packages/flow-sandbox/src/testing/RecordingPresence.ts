import type { LiveRunCheck, PresencePublisher } from '../WrapperPresence';

/** In-memory presence for tests: records publications and answers liveness from what was published or set. */
export class RecordingPresence implements PresencePublisher, LiveRunCheck {
	readonly events: string[] = [];
	readonly aliveWrappers = new Set<string>();
	readonly aliveRuns = new Set<string>();

	publish(wrapperId: string, executionId: string | undefined): void {
		this.events.push(`publish:${wrapperId}:${executionId ?? '-'}`);
	}

	withdraw(wrapperId: string): void {
		this.events.push(`withdraw:${wrapperId}`);
	}

	isWrapperAlive(wrapperId: string): boolean {
		return this.aliveWrappers.has(wrapperId);
	}

	isRunAlive(executionId: string): boolean {
		return this.aliveRuns.has(executionId);
	}
}
