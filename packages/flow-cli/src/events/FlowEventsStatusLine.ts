import type { FlowEventsStatus } from './FlowEventPublisher';

/** The single daemon-log line describing whether flow events will be delivered, at daemon start. */
export function flowEventsStatusLine(status: FlowEventsStatus): { level: 'info' | 'error'; message: string } {
	switch (status.state) {
		case 'enabled':
			return {
				level: 'info',
				message: `Queue events: enabled (flow.execution.* and flow.step.* are published; queue reached via ${status.via ?? 'the queue SDK'}).`,
			};
		case 'unavailable':
			return {
				level: 'error',
				message:
					`Queue events: unavailable, flow events will NOT reach the queue: ${status.reason} ` +
					'Fix it (install queue-cli so that "queue" is on the PATH of the daemon, then restart the flow daemon), ' +
					'or set FLOW_QUEUE_EVENTS=0 to switch events off and stop this message.',
			};
		case 'disabled':
			return { level: 'info', message: `Queue events: disabled (${status.reason}).` };
		default: {
			const unreachable: never = status;
			throw new Error(`Unknown flow events status: ${JSON.stringify(unreachable)}`);
		}
	}
}
