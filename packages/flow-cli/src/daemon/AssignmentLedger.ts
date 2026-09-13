import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

/** The daemon's record of work it actually handed to a worker. */
export interface Assignment {
	assignmentId: string;
	executionId: string;
	stepId: string;
	/**
	 * Whether the worker had begun executing the step (D#65).
	 *
	 * Set from the worker's own `step_started`, because the worker is the only party that
	 * knows it. It decides how a mid-step disconnect is treated: a step that never started
	 * is re-dispatched for free, while one already running is a step failure so a half-run
	 * script is not silently replayed.
	 */
	started: boolean;
}

/** Why a reported result could not be bound to an issued assignment. */
export type VerificationResult = { ok: true; assignment: Assignment } | { ok: false; reason: string };

/**
 * Binds every step result to an assignment the daemon actually issued (T-05).
 *
 * Today a worker is trusted because its PID was spawned by this pool. That signal
 * disappears once workers register inbound (D#1), so a worker could otherwise report
 * `step_completed` for a step it was never given -- corrupting another execution's
 * outputs. Results are therefore accepted only against an outstanding assignment
 * issued to that same connection.
 *
 * Rejections carry a reason rather than being silently dropped: a mismatch is either
 * an attack or a protocol bug, and both need to be visible.
 */
export class AssignmentLedger {
	private readonly outstanding = new Map<string, Assignment & { worker: WebSocket }>();

	/** Records an assignment about to be sent to `worker`. */
	issue(worker: WebSocket, executionId: string, stepId: string): Assignment {
		const assignment: Assignment = { assignmentId: randomUUID(), executionId, stepId, started: false };
		this.outstanding.set(assignment.assignmentId, { ...assignment, worker });
		return assignment;
	}

	/**
	 * What an outstanding assignment refers to, or undefined once it has settled.
	 *
	 * Read-only, and no worker is returned: this exists so the daemon can name the execution and
	 * step of an assignment it is failing on its own initiative, not to route anything.
	 */
	describe(assignmentId: string): Assignment | undefined {
		const found = this.outstanding.get(assignmentId);
		if (found === undefined) return undefined;
		const { assignmentId: id, executionId, stepId, started } = found;
		return { assignmentId: id, executionId, stepId, started };
	}

	/**
	 * Checks a reported result against the outstanding assignments.
	 *
	 * All three of assignment id, execution id and step id must match, and the report
	 * must come from the connection the assignment was issued to -- a valid id is not
	 * enough to report a *different* step.
	 */
	verify(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): VerificationResult {
		const found = this.outstanding.get(assignmentId);
		if (found === undefined) {
			return {
				ok: false,
				reason: `unknown assignment "${assignmentId}" reported for step "${stepId}" (execution "${executionId}") -- it was never issued, or has already been settled`,
			};
		}
		if (found.worker !== worker) {
			return {
				ok: false,
				reason: `assignment "${assignmentId}" was issued to a different worker -- refusing a result for step "${stepId}"`,
			};
		}
		if (found.executionId !== executionId) {
			return {
				ok: false,
				reason: `assignment "${assignmentId}" belongs to execution "${found.executionId}", but a result was reported for execution "${executionId}"`,
			};
		}
		if (found.stepId !== stepId) {
			return {
				ok: false,
				reason: `assignment "${assignmentId}" was issued for step "${found.stepId}", but a result was reported for step "${stepId}"`,
			};
		}
		const { worker: _worker, ...assignment } = found;
		return { ok: true, assignment };
	}

	/**
	 * Checks a message that names no step, such as `inject_steps`: the step is implied
	 * by the assignment itself. Ownership and execution must still match, so a worker
	 * cannot inject steps into an execution it was not working on.
	 */
	verifyScope(worker: WebSocket, assignmentId: string, executionId: string): VerificationResult {
		const found = this.outstanding.get(assignmentId);
		if (found === undefined) {
			return {
				ok: false,
				reason: `unknown assignment "${assignmentId}" reported for execution "${executionId}" -- it was never issued, or has already been settled`,
			};
		}
		return this.verify(worker, assignmentId, executionId, found.stepId);
	}

	/**
	 * Closes an assignment once its outcome has been accepted, so the same result
	 * cannot be replayed. Unknown ids are ignored: a late result may arrive after the
	 * execution was cleaned up, which is normal rather than exceptional.
	 */
	settle(assignmentId: string): void {
		this.outstanding.delete(assignmentId);
	}

	/**
	 * Records that the worker has begun executing the assigned step (D#65).
	 *
	 * Unknown ids are ignored for the same reason as `settle`: the message may cross a
	 * settle or a revocation. Callers verify the report first, so an id reaching here is
	 * one this ledger issued to that connection.
	 */
	markStarted(assignmentId: string): void {
		const found = this.outstanding.get(assignmentId);
		if (found !== undefined) found.started = true;
	}

	/** Assignments still outstanding for a worker, in issue order. */
	outstandingFor(worker: WebSocket): Assignment[] {
		const result: Assignment[] = [];
		for (const entry of this.outstanding.values()) {
			if (entry.worker === worker) {
				const { worker: _worker, ...assignment } = entry;
				result.push(assignment);
			}
		}
		return result;
	}

	/**
	 * Drops everything outstanding for a disconnected worker and returns it, so the
	 * caller can decide what to do with the interrupted steps (D#65).
	 */
	revokeWorker(worker: WebSocket): Assignment[] {
		const revoked = this.outstandingFor(worker);
		for (const assignment of revoked) {
			this.outstanding.delete(assignment.assignmentId);
		}
		return revoked;
	}
}
