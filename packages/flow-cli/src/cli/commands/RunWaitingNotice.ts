import { executionsDirOf, isWaitingForWorkspace } from 'flow-core';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { ExecutionStore } from '../../storage/ExecutionStore';

/**
 * What `flow run` tells right after the daemon accepted the run, when that run waits for a workspace.
 * The daemon answers `execution_started` for a waiting run too (the record is written before the answer), so the
 * record is read once instead of changing the protocol. `undefined` when the run starts now or the record is not there.
 */
export function runWaitingNotice(executionId: string, daemonDir: string): string | undefined {
	const store = new ExecutionStore(executionsDirOf(daemonDir));
	if (!store.exists(executionId)) {
		return undefined;
	}
	const record = store.read(executionId);
	if (!isWaitingForWorkspace(record)) {
		return undefined;
	}
	return `Execution ${executionId} is waiting for a workspace and has not started. ${record.workspaceWait!.message}`;
}
