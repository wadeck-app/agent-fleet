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

/** Written in the executions directory (never `.json`, so no record listing sees it): when the last reconcile began. */
export const RECONCILE_CHECKPOINT_FILE = '.reconciled-at';
/** Absorbs coarse file-system timestamps and small clock steps when comparing a record's mtime to the checkpoint. */
const MTIME_SLACK_MS = 60_000;

/**
 * Called once when the daemon starts, before it accepts work: all execution state lives in the
 * daemon's memory, so a record still `queued`/`running` now belongs to a previous daemon and can
 * never finish. Fails it (running steps failed, pending steps settled as not run) with the reason
 * and how to re-run, and publishes the usual execution-failed transition. Idempotent.
 *
 * Bounded work: a record is only ever left `queued`/`running` by a daemon that wrote it after the previous
 * reconcile began (that one examined every record, and a settled record is not reopened without being rewritten).
 * So once a checkpoint exists, a record whose mtime is older than it is skipped unread: with a thousand
 * records, opening them all cost seconds before the daemon could answer. No checkpoint: every record is read.
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
		const startedAt = Date.now();
		const skipOlderThan = this.readCheckpoint();
		let reconciled = 0;
		for (const name of names) {
			if (skipOlderThan !== undefined && this.lastWrittenBefore(name, skipOlderThan)) {
				continue;
			}
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
		this.writeCheckpoint(startedAt);
		return reconciled;
	}

	/** Epoch ms before which a record is known settled, or undefined when every record must be read. */
	private readCheckpoint(): number | undefined {
		const file = path.join(this.executionsDir, RECONCILE_CHECKPOINT_FILE);
		let content: string;
		try {
			content = fs.readFileSync(file, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				process.stderr.write(`[ExecutionStore] cannot read ${file}: ${String(err)}. Reading every record.
`);
			}
			return undefined;
		}
		const parsed = Number(content.trim());
		if (!Number.isFinite(parsed) || parsed <= 0) {
			process.stderr.write(`[ExecutionStore] ${file} does not hold a timestamp. Reading every record.
`);
			return undefined;
		}
		return parsed - MTIME_SLACK_MS;
	}

	private lastWrittenBefore(name: string, limitMs: number): boolean {
		try {
			return fs.statSync(path.join(this.executionsDir, name)).mtimeMs < limitMs;
		} catch {
			// Cannot tell: read it, which reports the problem.
			return false;
		}
	}

	private writeCheckpoint(startedAt: number): void {
		const file = path.join(this.executionsDir, RECONCILE_CHECKPOINT_FILE);
		try {
			fs.writeFileSync(file, String(startedAt), 'utf8');
		} catch (err) {
			process.stderr.write(
				`[ExecutionStore] cannot write ${file}: ${String(err)}. The next start reads every record (slower).
`
			);
		}
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
