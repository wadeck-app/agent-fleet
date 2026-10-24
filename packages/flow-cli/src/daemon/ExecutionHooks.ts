import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';

import type { LogWriter } from '../storage/LogWriter';

/** Per-execution hook dispatchers, and the dispatch of an event to the one an execution registered. */
export class ExecutionHooks {
	private readonly dispatchers = new Map<string, HookDispatcher>();

	constructor(private readonly logWriter: LogWriter) {}

	register(executionId: string, dispatcher: HookDispatcher): void {
		this.dispatchers.set(executionId, dispatcher);
	}

	remove(executionId: string): void {
		this.dispatchers.delete(executionId);
	}

	dispatch(
		executionId: string,
		event: Parameters<HookDispatcher['dispatch']>[0],
		payload: Record<string, unknown>
	): void {
		const dispatcher = this.dispatchers.get(executionId);
		void dispatcher?.dispatch(event, payload, err => {
			this.logWriter.writeExecution('__hook', `Hook '${event}' failed: ${String(err)}`, 'error');
		});
	}
}
