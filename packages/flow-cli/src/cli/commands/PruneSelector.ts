import { type ExecutionState, InvalidQueryError, PAUSED_STATUS, RECOVERED_STATUS, filterExecutions } from 'flow-core';

/** What `flow prune` was asked to select. */
export interface PruneCriteria {
	/** Registry id of the project (already resolved). */
	projectId?: string;
	/** Exact flow ids; an execution of any of them matches. */
	flows: string[];
	status?: string;
	/** Epoch ms: only executions that started strictly before. */
	beforeMs?: number;
}

/** An execution `flow prune` will not delete, with the reason a user can act on. */
export interface PruneRefusal {
	executionId: string;
	reason: string;
}

export interface PruneSelection {
	/** Finished executions (completed or failed, not paused) that match: the ones that may be deleted. */
	deletable: ExecutionState[];
	/** Matching executions that are not finished: never deleted. */
	refused: PruneRefusal[];
}

/** Statuses a record can hold, plus the two virtual ones `flow history --status` accepts. */
const KNOWN_STATUSES = [
	'queued',
	'running',
	're-queued',
	'completed',
	'failed',
	PAUSED_STATUS,
	RECOVERED_STATUS,
] as const;

/** Asking for one of these selects only runs that cannot be deleted: a mistake, not a broad filter. */
const UNFINISHED_STATUSES: readonly string[] = ['queued', 'running', 're-queued', PAUSED_STATUS];

/** Decides which stored executions `flow prune` selects, and which of them are safe to delete. */
export class PruneSelector {
	/** True when at least one criterion narrows the selection: `flow prune` never selects the whole history. */
	static hasFilter(criteria: PruneCriteria): boolean {
		return (
			criteria.projectId !== undefined ||
			criteria.flows.length > 0 ||
			criteria.status !== undefined ||
			criteria.beforeMs !== undefined
		);
	}

	/** True when `--status` names only runs that are not finished (nothing it selects can be deleted). */
	static asksForUnfinished(status: string | undefined): boolean {
		return status !== undefined && UNFINISHED_STATUSES.includes(status);
	}

	/** @throws InvalidQueryError for a status that no record can have. */
	static assertKnownStatus(status: string): void {
		if (!(KNOWN_STATUSES as readonly string[]).includes(status)) {
			throw new InvalidQueryError(
				`Invalid --status "${status}": expected one of ${KNOWN_STATUSES.join(', ')}. Only completed and failed runs are ever deleted.`
			);
		}
	}

	/** `records` in any order. An execution whose start time cannot be read never matches `--before` (it is not guessed). */
	static select(records: readonly ExecutionState[], criteria: PruneCriteria): PruneSelection {
		const { items } = filterExecutions([...records], {
			limit: Number.MAX_SAFE_INTEGER,
			...(criteria.status === undefined ? {} : { status: criteria.status }),
			...(criteria.projectId === undefined ? {} : { projectId: criteria.projectId }),
		});
		const matched = items.filter(
			record =>
				(criteria.flows.length === 0 || criteria.flows.includes(record.flowId)) &&
				(criteria.beforeMs === undefined || PruneSelector.startedBefore(record.startedAt, criteria.beforeMs))
		);
		const deletable: ExecutionState[] = [];
		const refused: PruneRefusal[] = [];
		for (const record of matched) {
			const reason = PruneSelector.refusalReason(record);
			if (reason === undefined) {
				deletable.push(record);
			} else {
				refused.push({ executionId: record.executionId, reason });
			}
		}
		return { deletable, refused };
	}

	/** Why a record must not be deleted, or undefined when it is finished (completed or failed) and not paused. Unknown states are refused. */
	static refusalReason(record: Pick<ExecutionState, 'status' | 'paused'>): string | undefined {
		if (record.paused !== undefined) {
			return `paused (status ${record.status}): not finished. Run \`flow unpause\` then \`flow cancel\` on it first if it is useless.`;
		}
		switch (record.status) {
			case 'completed':
			case 'failed':
				return undefined;
			case 'running':
			case 'queued':
			case 're-queued':
				return `${record.status}: not finished. Run \`flow cancel\` on it first; if the daemon is stopped and the record is stale, start the daemon so it fails interrupted runs, then rerun.`;
			default:
				return `unknown status ${JSON.stringify(record.status)}: not deleted because it cannot be shown to be finished.`;
		}
	}

	private static startedBefore(startedAt: string, beforeMs: number): boolean {
		const started = Date.parse(startedAt);
		return !Number.isNaN(started) && started < beforeMs;
	}
}
