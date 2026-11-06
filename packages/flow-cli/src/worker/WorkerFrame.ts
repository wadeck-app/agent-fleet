import type { WorkerToDaemon } from '../ipc/Protocol';
import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import { cutToTail } from './StepResultFrame';

/** A frame the daemon would refuse by closing the socket; raised before anything is sent. */
export class WorkerFrameTooLargeError extends Error {
	constructor(messageType: string, sizeBytes: number) {
		super(
			`Cannot send a ${messageType} frame of ${String(sizeBytes)} bytes: the daemon accepts at most ` +
				`${String(MAX_WORKER_FRAME_BYTES)} bytes per message and would close the connection. ` +
				`Reduce what the step returns (outputs, captured stdout/stderr): write large data to a file and return its path.`
		);
		this.name = 'WorkerFrameTooLargeError';
	}
}

// A log line is sent from inside the step (a streamed model message, a tool result): refusing it would throw into the
// running step and lose work, so its message is cut to its tail instead.
function shrinkLog(message: Extract<WorkerToDaemon, { type: 'log' }>, size: number): string {
	const original = message.entry.message;
	const overhead = size - Buffer.byteLength(JSON.stringify(original), 'utf8');
	const fits = (keepChars: number): boolean =>
		overhead + Buffer.byteLength(JSON.stringify(cutToTail(original, keepChars).text), 'utf8') <=
		MAX_WORKER_FRAME_BYTES;
	let low = 0;
	let high = original.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (fits(mid)) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	const shrunk = JSON.stringify({ ...message, entry: { ...message.entry, message: cutToTail(original, low).text } });
	const shrunkSize = Buffer.byteLength(shrunk, 'utf8');
	if (shrunkSize > MAX_WORKER_FRAME_BYTES) {
		throw new WorkerFrameTooLargeError(message.type, shrunkSize);
	}
	return shrunk;
}

/**
 * Serializes a worker message, refusing one the daemon would drop the connection over.
 *
 * An oversized `step_failed` is shrunk to its error (and meta) so the failure still arrives; an oversized `log` has its
 * message cut to its tail; any other oversized frame throws {@link WorkerFrameTooLargeError}. A finished step's
 * `step_completed` is fitted earlier, by `fitStepCompleted`, so this is only its last guard.
 */
export function serializeWorkerFrame(message: WorkerToDaemon): string {
	const full = JSON.stringify(message);
	const size = Buffer.byteLength(full, 'utf8');
	if (size <= MAX_WORKER_FRAME_BYTES) {
		return full;
	}
	if (message.type === 'log') {
		return shrinkLog(message, size);
	}
	if (message.type !== 'step_failed') {
		throw new WorkerFrameTooLargeError(message.type, size);
	}
	const { assignmentId, executionId, stepId, error, meta } = message;
	const shrunk = JSON.stringify({
		type: 'step_failed',
		assignmentId,
		executionId,
		stepId,
		// Small, and the only record of what the failed attempt cost: kept
		...(meta !== undefined && { meta }),
		error: `${error} (the step's outputs and captured stdout/stderr were dropped: the failure report was ${String(size)} bytes, over the ${String(MAX_WORKER_FRAME_BYTES)}-byte limit)`,
	});
	const shrunkSize = Buffer.byteLength(shrunk, 'utf8');
	if (shrunkSize > MAX_WORKER_FRAME_BYTES) {
		throw new WorkerFrameTooLargeError(message.type, shrunkSize);
	}
	return shrunk;
}
