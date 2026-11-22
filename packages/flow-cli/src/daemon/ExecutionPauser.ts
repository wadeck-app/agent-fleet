import { isExecutionId } from 'flow-core';

import type { DaemonResponse } from '../ipc/Protocol';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { ExecutionRegistry } from './ExecutionRegistry.js';

/** Longest `--reason` accepted: it is stored, shown by `flow show` and published (first line) with the event. */
export const MAX_PAUSE_REASON_CHARS = 500;

/** What the pauser changes, each as the narrowest view of the collaborator that owns it. */
export interface ExecutionPauserParts {
	executions: Pick<ExecutionRegistry, 'isActive' | 'resumable' | 'pause' | 'unpause' | 'isPaused'>;
	store: Pick<ExecutionStore, 'exists' | 'read' | 'markExecutionPaused' | 'markExecutionUnpaused'>;
	logWriter: Pick<LogWriter, 'writeExecution'>;
	/** Hands out the steps held back while the run was paused. */
	tryDispatch: () => void;
}

type ReasonCheck = { ok: true; reason: string | undefined } | { ok: false; refusal: DaemonResponse };

/**
 * `flow pause` / `flow unpause`: holds back the NEW steps of ONE running execution, and releases them.
 *
 * Not a kill: the steps already running finish and report normally, the run keeps its status (`paused` is a flag of the
 * record, like `workspaceWait`), the workers and the workspace stay held. The dispatcher leaves the ready steps of a paused
 * run in the queue (`StepDispatcher`), so an unpause hands each out exactly once.
 *
 * The pause lives in the daemon's memory like the run itself: a daemon restart ends a paused run as it ends any other
 * (see `InterruptedExecutionReconciler`), it never leaves a paused record behind.
 */
export class ExecutionPauser {
	constructor(private readonly parts: ExecutionPauserParts) {}

	pause(executionId: string, reason?: string, projectId?: string): DaemonResponse {
		const { store, executions } = this.parts;
		const refusal = this.refuseUnknownOrForeign(executionId, projectId, 'pause');
		if (refusal !== undefined) {
			return refusal;
		}
		const checked = this.checkReason(reason);
		if (!checked.ok) {
			return checked.refusal;
		}
		const state = store.read(executionId);
		if (state.paused !== undefined) {
			const why = state.paused.reason === undefined ? '' : `: ${state.paused.reason}`;
			return {
				type: 'error',
				code: 'EXECUTION_ALREADY_PAUSED',
				message: `Execution "${executionId}" is already paused (since ${state.paused.since}${why}). Resume it with: flow unpause ${executionId}`,
			};
		}
		if (executions.resumable(executionId) !== undefined) {
			return {
				type: 'error',
				code: 'EXECUTION_NOT_PAUSABLE',
				message: `Execution "${executionId}" is stopped on an unanswered user_intervention step, nothing runs or is dispatched: answer it and run flow resume ${executionId}, or cancel it with: flow cancel ${executionId}`,
			};
		}
		const held = executions.isActive(executionId);
		if (!held && (state.status === 'completed' || state.status === 'failed')) {
			return {
				type: 'error',
				code: 'EXECUTION_ALREADY_ENDED',
				message: `Execution "${executionId}" already ended as ${state.status}; there is nothing to pause.`,
			};
		}
		if (!held) {
			return {
				type: 'error',
				code: 'EXECUTION_NOT_RUNNING',
				message:
					state.workspaceWait === undefined
						? `Execution "${executionId}" is recorded as ${state.status} but this daemon does not run it (it belongs to a daemon that is gone), so there is nothing to pause. See: flow history`
						: `Execution "${executionId}" has not started: it waits for a free workspace and has no step to hold back. Cancel it with: flow cancel ${executionId}`,
			};
		}

		// Record first: when it cannot be written the run is not paused, and the error that propagates tells the user.
		const written = store.markExecutionPaused(executionId, checked.reason);
		executions.pause(executionId);
		const why = checked.reason === undefined ? '' : `: ${checked.reason}`;
		this.parts.logWriter.writeExecution(
			executionId,
			`Execution paused by the user (flow pause)${why}. Running steps finish; no new step starts until: flow unpause ${executionId}`,
			'warning'
		);
		return {
			type: 'execution_paused',
			executionId,
			since: written.paused!.since,
			...(checked.reason === undefined ? {} : { reason: checked.reason }),
		};
	}

	unpause(executionId: string, projectId?: string): DaemonResponse {
		const { store, executions } = this.parts;
		const refusal = this.refuseUnknownOrForeign(executionId, projectId, 'unpause');
		if (refusal !== undefined) {
			return refusal;
		}
		const state = store.read(executionId);
		if (state.paused === undefined) {
			const ended = state.status === 'completed' || state.status === 'failed';
			return {
				type: 'error',
				code: 'EXECUTION_NOT_PAUSED',
				message: ended
					? `Execution "${executionId}" already ended as ${state.status}; it is not paused. To reopen a failed execution use: flow resume ${executionId}`
					: `Execution "${executionId}" is not paused (status ${state.status}). Pause it with: flow pause ${executionId}`,
			};
		}
		if (!executions.isPaused(executionId)) {
			// The record says paused but this daemon does not hold the pause: it belongs to a daemon that is gone. Never guess.
			return {
				type: 'error',
				code: 'EXECUTION_NOT_RUNNING',
				message: `Execution "${executionId}" is recorded as paused but this daemon does not run it (it belongs to a daemon that is gone). See: flow history`,
			};
		}

		const written = store.markExecutionUnpaused(executionId);
		executions.unpause(executionId);
		this.parts.logWriter.writeExecution(executionId, 'Execution resumed by the user (flow unpause)', 'info');
		this.parts.tryDispatch();
		return { type: 'execution_unpaused', executionId, pausedMs: written.pausedMs ?? 0 };
	}

	private refuseUnknownOrForeign(
		executionId: string,
		projectId: string | undefined,
		verb: 'pause' | 'unpause'
	): DaemonResponse | undefined {
		const { store } = this.parts;
		if (!isExecutionId(executionId) || !store.exists(executionId)) {
			return {
				type: 'error',
				code: 'EXECUTION_NOT_FOUND',
				message: `No execution found with id "${executionId}". Find the id with: flow history`,
			};
		}
		const state = store.read(executionId);
		if (projectId !== undefined && state.projectId !== projectId) {
			return {
				type: 'error',
				code: 'PROJECT_MISMATCH',
				message:
					`Execution "${executionId}" does not belong to the selected project (${state.projectId ?? 'no project recorded'}). ` +
					`Drop -p/--project (and FLOW_PROJECT) to ${verb} it, or select its project.`,
			};
		}
		return undefined;
	}

	private checkReason(reason: string | undefined): ReasonCheck {
		if (reason === undefined) {
			return { ok: true, reason: undefined };
		}
		const trimmed = reason.trim();
		if (trimmed === '') {
			return {
				ok: false,
				refusal: {
					type: 'error',
					code: 'INVALID_REASON',
					message:
						'The pause reason is blank: give a text (flow pause <id> --reason "<why>") or omit --reason.',
				},
			};
		}
		if (trimmed.length > MAX_PAUSE_REASON_CHARS) {
			return {
				ok: false,
				refusal: {
					type: 'error',
					code: 'INVALID_REASON',
					message: `The pause reason is ${String(trimmed.length)} characters long, the limit is ${String(MAX_PAUSE_REASON_CHARS)}: shorten it.`,
				},
			};
		}
		return { ok: true, reason: trimmed };
	}
}
