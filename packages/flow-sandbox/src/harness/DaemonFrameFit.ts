import { MAX_WORKER_FRAME_BYTES } from 'flow-cli/src/ipc/WorkerFrameLimit';
import {
	type StepCompletedReport,
	StepResultTooLargeError,
	fitStepCompleted,
} from 'flow-cli/src/worker/StepResultFrame';
import { serializeWorkerFrame } from 'flow-cli/src/worker/WorkerFrame';

import type { JsonObject } from './HarnessMessages';

/**
 * Makes a message fit the daemon's frame limit the way flow's own worker does (flow-cli `Worker.ts`), by calling the
 * same functions: a finished step's `step_completed` is fitted by cutting diagnostics first (io, then the outputs the
 * step did not declare) behind a `truncated` marker, declared outputs are never cut, and a result that still does not
 * fit becomes a `step_failed` flagged `origin: 'engine'` (the daemon does not retry it) that keeps the attempt's meta;
 * an oversized `step_failed` keeps its error, an oversized `log` keeps its tail. Anything else oversized throws.
 *
 * The limit is {@link MAX_WORKER_FRAME_BYTES}; what is counted is the frame as it is SENT, so call it on the message
 * after the paths were translated (a host path is longer than a sandbox path).
 */
export class DaemonFrameFit {
	static fit(message: JsonObject, declared: ReadonlySet<string>): JsonObject {
		if (Buffer.byteLength(JSON.stringify(message), 'utf8') <= MAX_WORKER_FRAME_BYTES) return message;
		if (message['type'] === 'step_completed') {
			try {
				return fitStepCompleted(
					String(message['assignmentId']),
					message as unknown as StepCompletedReport,
					declared
				) as unknown as JsonObject;
			} catch (error) {
				if (!(error instanceof StepResultTooLargeError)) throw error;
				return {
					type: 'step_failed',
					assignmentId: message['assignmentId'],
					executionId: message['executionId'],
					stepId: message['stepId'],
					error: error.message,
					...(error.meta === undefined ? {} : { meta: error.meta as unknown as JsonObject }),
					origin: error.origin,
				};
			}
		}
		// step_failed and log are shrunk; any other type throws WorkerFrameTooLargeError with the reason.
		return JSON.parse(serializeWorkerFrame(message as never)) as JsonObject;
	}
}
