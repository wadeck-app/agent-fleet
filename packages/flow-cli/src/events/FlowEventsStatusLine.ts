import { FLOW_EVENT_SOURCE } from 'flow-engine';

import type { FlowEventsDeclaration, FlowEventsStatus } from './FlowEventPublisher';

const CATALOG_FILE = 'packages/flow-engine/src/events/FlowEventCatalog.ts';

type Line = { level: 'info' | 'error'; message: string };

/**
 * The single daemon-log line describing whether flow events will be delivered, and whether the
 * queue documents them, at daemon start. `declaration` is undefined when none was attempted.
 */
export function flowEventsStatusLine(status: FlowEventsStatus, declaration: FlowEventsDeclaration | undefined): Line {
	switch (status.state) {
		case 'enabled':
			return enabledLine(status.via, declaration);
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

function enabledLine(via: 'daemon' | 'queue-start' | undefined, declaration: FlowEventsDeclaration | undefined): Line {
	const published = `enabled (flow.execution.* and flow.step.* are published; queue reached via ${via ?? 'the queue SDK'})`;
	if (declaration === undefined) {
		return { level: 'info', message: `Queue events: ${published}.` };
	}
	const stillPublished = 'The events are still published, but "queue events" shows them undeclared.';
	switch (declaration.state) {
		case 'registered':
			return {
				level: 'info',
				message: `Queue events: ${published}; declared to the queue (${String(declaration.count)} events, source "${FLOW_EVENT_SOURCE}"; see "queue events list").`,
			};
		case 'rejected': {
			const details =
				declaration.problems.length > 0
					? declaration.problems.map(problem => `${problem.path}: ${problem.message}`).join('; ')
					: declaration.reason;
			return {
				level: 'error',
				message:
					`Queue events: ${published}, but the queue REJECTED the event declaration: ${details}. ${stillPublished} ` +
					`Fix the definitions in ${CATALOG_FILE} (events[n] is the index in that catalog), then restart the flow daemon.`,
			};
		}
		case 'unsupported':
			return {
				level: 'error',
				message:
					`Queue events: ${published}, but the queue daemon is older than 1.1.0 and cannot take event declarations (${declaration.reason}). ` +
					`${stillPublished} Run "queue cli update", then restart the flow daemon.`,
			};
		case 'dropped':
		case 'unknown':
			return {
				level: 'error',
				message:
					`Queue events: ${published}, but the event declaration is ${declaration.state}: ${declaration.reason} ` +
					`${declaration.state === 'unknown' ? 'It may or may not be stored.' : stillPublished} ` +
					'Restart the flow daemon to declare again.',
			};
		case 'not-declared':
			return {
				level: 'info',
				message: `Queue events: ${published}; events not declared (${declaration.reason}).`,
			};
		default: {
			const unreachable: never = declaration;
			throw new Error(`Unknown flow events declaration: ${JSON.stringify(unreachable)}`);
		}
	}
}
