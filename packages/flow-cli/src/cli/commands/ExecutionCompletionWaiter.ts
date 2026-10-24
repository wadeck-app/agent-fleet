import { executionsDirOf, logFilePath, todayLogDate } from 'flow-core';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type { ExecutionState } from '../../ipc/Protocol';
import { ExecutionStore } from '../../storage/ExecutionStore';
import { tailLogFile } from './ExecutionLogTail';

// violations-suppress-end: ts/no-deep-relative

export class ExecutionTimeoutError extends Error {}

export async function waitForCompletion(
	executionId: string,
	daemonDir: string,
	timeoutMs: number,
	onLog?: (stepId: string, message: string) => void,
	options?: { fastPoll?: boolean }
): Promise<ExecutionState> {
	const store = new ExecutionStore(executionsDirOf(daemonDir));
	const logFile = logFilePath(daemonDir, todayLogDate());
	const deadline = Date.now() + timeoutMs;
	// fastPoll: fixed 50ms (streaming/polling log modes). Normal: starts 200ms, grows to 2000ms.
	let delay = options?.fastPoll ? 50 : 200;
	let lastByte = 0;
	while (Date.now() < deadline) {
		if (onLog) {
			lastByte = tailLogFile(logFile, executionId, lastByte, onLog);
		}
		// Only read once the file exists -- avoids swallowing real I/O errors (disk-full, bad JSON)
		// by conflating them with the normal "not yet written" case.
		if (store.exists(executionId)) {
			const state = store.read(executionId);
			if (state.status === 'completed' || state.status === 'failed') {
				if (onLog) {
					tailLogFile(logFile, executionId, lastByte, onLog);
				}
				return state;
			}
		}
		await new Promise(r => setTimeout(r, delay));
		if (!options?.fastPoll) {
			delay = Math.min(delay * 1.5, 2000);
		}
	}
	throw new ExecutionTimeoutError(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}
