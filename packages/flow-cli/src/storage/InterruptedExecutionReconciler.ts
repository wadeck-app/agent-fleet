import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionState } from '../ipc/Protocol';
import type { ExecutionTransition } from './ExecutionTransition';
import { failRunningSteps } from './RunningStepsFailer';

/** What the reconciler needs from the store that owns the records. */
export interface ReconcilerHost {
	read(executionId: string): ExecutionState;
	/** Persists the record and returns what was written (masked). */
	write(state: ExecutionState): ExecutionState;
	notify(transition: ExecutionTransition): void;
	mask(executionId: string, text: string): string;
}

/**
 * Called once when the daemon starts, before it accepts work: all execution state lives in the
 * daemon's memory, so a record still `queued`/`running` now belongs to a previous daemon and can
 * never finish. Fails it (running steps failed, pending steps settled as not run) with the reason
 * and how to re-run, and publishes the usual execution-failed transition. Idempotent.
 */
export class InterruptedExecutionReconciler {
	constructor(
		private readonly executionsDir: string,
		private readonly host: ReconcilerHost
	) {}

	/** An unreadable record is reported on stderr and skipped. Returns how many were reconciled. */
	reconcile(): number {
		let names: string[];
		try {
			names = fs.readdirSync(this.executionsDir).filter(name => name.endsWith('.json'));
		} catch (err) {
			process.stderr.write(
				`[ExecutionStore] cannot list ${this.executionsDir} to reconcile interrupted executions: ${String(err)}\n`
			);
			return 0;
		}
		let reconciled = 0;
		for (const name of names) {
			try {
				const current = this.host.read(path.basename(name, '.json'));
				if (current.status !== 'queued' && current.status !== 'running') {
					continue;
				}
				this.interrupt(current);
				reconciled++;
			} catch (err) {
				process.stderr.write(
					`[ExecutionStore] could not reconcile ${name} (left untouched): ${String(err)}. Inspect or delete ${path.join(this.executionsDir, name)}.\n`
				);
			}
		}
		return reconciled;
	}

	private interrupt(current: ExecutionState): void {
		const reason = `interrupted: the daemon restarted while this execution was running; re-run it with flow run ${current.flowFile}`;
		const completedAt = new Date().toISOString();
		const steps = failRunningSteps(current, reason, text => this.host.mask(current.executionId, text));
		for (const [id, step] of Object.entries(steps)) {
			if (step.status === 'pending') {
				steps[id] = { ...step, status: 'completed', completedAt, skippedReason: `not run (${reason})` };
			}
		}
		const written = this.host.write({
			...current,
			status: 'failed',
			completedAt,
			currentSteps: [],
			lastError: reason,
			steps,
		});
		this.host.notify({ kind: 'execution-failed', state: written });
	}
}
