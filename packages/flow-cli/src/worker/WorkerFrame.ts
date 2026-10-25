import type { WorkerToDaemon } from '../ipc/Protocol';
import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';

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

/**
 * Serializes a worker message, refusing one the daemon would drop the connection over.
 *
 * An oversized `step_failed` is shrunk to its error so the failure still arrives; any other
 * oversized frame throws {@link WorkerFrameTooLargeError}.
 */
export function serializeWorkerFrame(message: WorkerToDaemon): string {
	const full = JSON.stringify(message);
	const size = Buffer.byteLength(full, 'utf8');
	if (size <= MAX_WORKER_FRAME_BYTES) {
		return full;
	}
	if (message.type !== 'step_failed') {
		throw new WorkerFrameTooLargeError(message.type, size);
	}
	const { assignmentId, executionId, stepId, error } = message;
	const shrunk = JSON.stringify({
		type: 'step_failed',
		assignmentId,
		executionId,
		stepId,
		error: `${error} (the step's outputs and captured stdout/stderr were dropped: the failure report was ${String(size)} bytes, over the ${String(MAX_WORKER_FRAME_BYTES)}-byte limit)`,
	});
	const shrunkSize = Buffer.byteLength(shrunk, 'utf8');
	if (shrunkSize > MAX_WORKER_FRAME_BYTES) {
		throw new WorkerFrameTooLargeError(message.type, shrunkSize);
	}
	return shrunk;
}
