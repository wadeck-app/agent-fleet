import { createQueuePublisher } from '@wadeck-app/queue-sdk';

import { FailureStreakReporter } from './FailureStreakReporter';
import type { FlowEventPublisher } from './FlowEventPublisher';
import { NullFlowEventPublisher } from './NullFlowEventPublisher';
import { QueueFlowEventPublisher } from './QueueFlowEventPublisher';

/**
 * The one place the real queue SDK is constructed.
 *
 * `FLOW_QUEUE_EVENTS=0` switches events off (a `NullFlowEventPublisher`, not the SDK's `off`
 * option, which is reserved for test files). Any other value keeps them on; one that is not
 * recognised is reported, so a typo cannot silently leave events running.
 *
 * Note: when the queue daemon is stopped, the SDK starts it (`queue start`) on the first event.
 */
export function createFlowEventPublisher(
	env: NodeJS.ProcessEnv,
	log: (level: 'info' | 'error', message: string) => void
): FlowEventPublisher {
	const setting = env['FLOW_QUEUE_EVENTS'];
	if (setting === '0') {
		return new NullFlowEventPublisher('FLOW_QUEUE_EVENTS=0 is set; unset it to publish flow events to the queue');
	}
	if (setting !== undefined && setting !== '' && setting !== '1') {
		log(
			'error',
			`Queue events: FLOW_QUEUE_EVENTS="${setting}" is not understood (use 0 to switch events off); events stay on.`
		);
	}
	const streaks = new FailureStreakReporter(line => log('error', line));
	return new QueueFlowEventPublisher(
		createQueuePublisher({
			// The daemon has no terminal: failures go to the daemon log instead of the SDK's console.warn.
			silent: true,
			onError: failure => streaks.report(failure),
			onWarning: warning => log('info', `Queue events: ${warning}`),
		})
	);
}
