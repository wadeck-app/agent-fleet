import { getErrorMessage } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_RUN_EVENTS } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';
import type { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

/** Settings of the run-end feature (`worker.runEventsEnabled`, `worker.ackTimeoutSeconds`). */
export interface RunEndSettings {
	/** Kill switch: false means nothing is sent, nothing is awaited and the run's workspace is released at once. */
	enabled: boolean;
	/** Bound of each wait: the served workers settling, then their acknowledgements. */
	ackTimeoutMs: number;
}

/** What `begin` hands back: finishing the run's end, then running what must wait for it. */
export interface PendingRunEnd {
	/**
	 * Waits (bounded) for the served workers to settle, tells them the run ended, waits (bounded) for their
	 * acknowledgement, then runs `afterAck`. Never rejects: a wait that expires is reported and `afterAck` still runs,
	 * because holding a workspace for ever is worse than releasing it under a worker that did not answer.
	 */
	finish(afterAck: () => Promise<void>): Promise<void>;
}

/** A worker that must be told, with what an error about it has to name. */
interface Recipient {
	ws: WebSocket;
	workerId: string;
	sourceId: string | undefined;
}

interface Run {
	executionId: string;
	reason: 'completed' | 'failed' | 'daemon_stopping';
	/** Still-connected workers that declared run-events and were handed a step of the run. */
	recipients: Recipient[];
	/** Set once run_end went out: resolves when every delivered worker answered, left, or the timeout expired. */
	acknowledged?: Promise<void>;
	/** Ends the settle wait early (the daemon is stopping). */
	interruptSettle?: () => void;
}

interface PendingAcks {
	awaiting: Set<WebSocket>;
	check: () => void;
}

/**
 * Tells the workers that served a run that it ended, and holds back what must wait for them (releasing the run's
 * workspace) until they confirmed or a bounded wait expired.
 *
 * Only workers that declared `run-events` AND were handed a step of the run are told; everyone else sees no change on
 * the wire. A run ends while siblings may still execute (a terminal failure ends it at once), so the served workers are
 * first given a bounded time to settle: after the bound `run_end` goes out with a sibling possibly still running, and its
 * result is dropped as ever.
 *
 * On daemon stop {@link announceDaemonStop} sends `run_end(daemon_stopping)` for every run still in progress, once, and
 * waits for the acknowledgements within ONE timeout, however many runs and workers there are. The sockets of workers
 * the daemon did not create are closed by the shutdown hook right after the notice is written, so for them the wait ends
 * as soon as the close is seen: the acknowledgement wait on stop mainly covers workers the daemon created. The notice
 * itself is always written before the close.
 */
export class RunEndCoordinator {
	private readonly running = new Map<string, Run>();
	private readonly pendingAcks = new Map<string, PendingAcks>();
	/** Runs the stop already told, so ending them afterwards does not tell them again. */
	private readonly announcedByStop = new Set<string>();
	private stopping: Promise<void> | undefined;

	constructor(
		private readonly registry: Pick<WorkerRegistry, 'describe' | 'sendToRunWorkers'>,
		private readonly supervisor: Pick<
			WorkerAssignmentSupervisor,
			'servedWorkers' | 'servedExecutions' | 'awaitSettled'
		>,
		private readonly logWriter: Pick<LogWriter, 'writeExecution'>,
		private readonly settings: RunEndSettings
	) {}

	/**
	 * Decides, for a run that is ending, whether anyone has to be told. Must be called BEFORE the supervisor forgets the
	 * run (it reads which workers served it).
	 *
	 * @returns undefined when nobody has to be told (switched off, no worker that served the run declared run-events, or
	 *          the daemon stop already told them): the caller then proceeds exactly as it always did.
	 */
	begin(executionId: string, reason: 'completed' | 'failed'): PendingRunEnd | undefined {
		if (!this.settings.enabled || this.announcedByStop.has(executionId)) {
			return undefined;
		}
		const recipients = this.recipientsOf(executionId);
		if (recipients.length === 0) {
			return undefined;
		}
		const run: Run = { executionId, reason, recipients };
		this.running.set(executionId, run);
		return { finish: afterAck => this.finish(run, afterAck) };
	}

	/** A worker acknowledged `run_end`. An ack nobody waits for is reported and dropped. */
	handleAck(ws: WebSocket, executionId: string): void {
		const pending = this.pendingAcks.get(executionId);
		if (pending?.awaiting.delete(ws) !== true) {
			this.logWriter.writeExecution(
				executionId,
				'Ignored a run_end_ack nobody was waiting for (unknown run, a worker that was not asked, or already acknowledged or timed out).',
				'warning'
			);
			return;
		}
		pending.check();
	}

	/** A worker's connection closed: it can no longer be told anything nor be waited for. */
	workerGone(ws: WebSocket): void {
		for (const run of this.running.values()) {
			run.recipients = run.recipients.filter(recipient => recipient.ws !== ws);
		}
		for (const pending of this.pendingAcks.values()) {
			if (pending.awaiting.delete(ws)) {
				pending.check();
			}
		}
	}

	/**
	 * Tells the workers of every run still in progress that the daemon is stopping, before their sockets close.
	 *
	 * Idempotent: the shutdown hook can run twice, and the second call sends nothing and returns the same wait. The
	 * stopping flag is set before anything is sent. Never rejects.
	 */
	announceDaemonStop(): Promise<void> {
		if (this.stopping !== undefined) {
			return this.stopping;
		}
		this.stopping = this.settings.enabled ? this.announceAll() : Promise.resolve();
		return this.stopping;
	}

	private announceAll(): Promise<void> {
		const waits: Promise<void>[] = [];
		// A run being finished is told now instead of after its settle wait; the wait it already started is shared.
		for (const run of this.running.values()) {
			run.interruptSettle?.();
			this.announcedByStop.add(run.executionId);
			waits.push(this.announce(run, 'daemon_stopping'));
		}
		for (const executionId of this.supervisor.servedExecutions()) {
			if (this.running.has(executionId)) {
				continue;
			}
			const recipients = this.recipientsOf(executionId);
			if (recipients.length === 0) {
				continue;
			}
			this.announcedByStop.add(executionId);
			waits.push(this.announce({ executionId, reason: 'daemon_stopping', recipients }, 'daemon_stopping'));
		}
		return Promise.all(waits).then(() => undefined);
	}

	private recipientsOf(executionId: string): Recipient[] {
		const recipients: Recipient[] = [];
		for (const ws of this.supervisor.servedWorkers(executionId)) {
			const worker = this.registry.describe(ws);
			if (worker?.features.includes(WORKER_FEATURE_RUN_EVENTS) === true) {
				recipients.push({ ws, workerId: worker.workerId, sourceId: worker.sourceId });
			}
		}
		return recipients;
	}

	private async finish(run: Run, afterAck: () => Promise<void>): Promise<void> {
		try {
			await this.settle(run);
			await this.announce(run, run.reason);
		} catch (err) {
			this.reportError(run.executionId, `run_end handling failed: ${describe(err)}`);
		} finally {
			this.running.delete(run.executionId);
		}
		try {
			await afterAck();
		} catch (err) {
			this.reportError(run.executionId, `what follows the end of the run failed: ${describe(err)}`);
		}
	}

	/** Gives the served workers a bounded time to hold nothing of the run any more. */
	private async settle(run: Run): Promise<void> {
		const wait = this.supervisor.awaitSettled(
			run.executionId,
			run.recipients.map(recipient => recipient.ws)
		);
		const interrupted = new Promise<void>(resolve => {
			run.interruptSettle = resolve;
		});
		const outcome = await raceWithTimeout(Promise.race([wait.done, interrupted]), this.settings.ackTimeoutMs);
		wait.cancel();
		if (outcome === 'timeout') {
			this.logWriter.writeExecution(
				run.executionId,
				`Worker(s) ${run.recipients.map(describeRecipient).join(', ')} still hold steps of this run after ${seconds(this.settings.ackTimeoutMs)}s; telling them the run ended anyway. In-flight steps may still report after run_end; their results are dropped.`,
				'warning'
			);
		}
	}

	/** Sends run_end (once per run) and waits for the delivered workers' acknowledgements, bounded. */
	private announce(run: Run, reason: Run['reason']): Promise<void> {
		run.acknowledged ??= this.sendAndAwait(run, reason);
		return run.acknowledged;
	}

	private async sendAndAwait(run: Run, reason: Run['reason']): Promise<void> {
		const { executionId } = run;
		const delivered = this.registry.sendToRunWorkers(
			run.recipients.map(recipient => recipient.ws),
			{ type: 'run_end', executionId, reason }
		);
		// A worker the message could not be written to is not waited for: it cannot answer.
		const awaiting = new Set(delivered);
		if (awaiting.size === 0) {
			return;
		}
		const told = run.recipients.filter(recipient => awaiting.has(recipient.ws));
		let check: () => void = () => {};
		const allAnswered = new Promise<void>(resolve => {
			check = () => {
				if (awaiting.size === 0) {
					resolve();
				}
			};
		});
		this.pendingAcks.set(executionId, { awaiting, check });
		try {
			const outcome = await raceWithTimeout(allAnswered, this.settings.ackTimeoutMs);
			if (outcome === 'timeout') {
				for (const recipient of told.filter(r => awaiting.has(r.ws))) {
					this.reportError(
						executionId,
						`${describeRecipient(recipient)} did not acknowledge run_end (${reason}) for execution ${executionId} within ${seconds(this.settings.ackTimeoutMs)}s. ` +
							`The run's workspace is released anyway, so whatever that worker still holds for this run (for example a sandbox) may be left behind: ` +
							`remove it by hand, or restart that worker. If it needs longer to clean up, raise worker.ackTimeoutSeconds in config.yml (maximum 120).`
					);
				}
			}
		} finally {
			this.pendingAcks.delete(executionId);
		}
	}

	private reportError(executionId: string, message: string): void {
		this.logWriter.writeExecution(executionId, message, 'error');
		process.stderr.write(`[RunEndCoordinator] execution ${executionId}: ${message}\n`);
	}
}

function describeRecipient(recipient: Recipient): string {
	return `worker ${recipient.workerId} (source ${recipient.sourceId ?? 'unknown'})`;
}

function seconds(ms: number): string {
	return String(Math.round(ms / 1000));
}

function describe(err: unknown): string {
	return getErrorMessage(err);
}

/** Resolves 'done' when `wait` does, 'timeout' after `ms`; the timer never outlives the race. */
async function raceWithTimeout(wait: Promise<void>, ms: number): Promise<'done' | 'timeout'> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<'timeout'>(resolve => {
		timer = setTimeout(() => resolve('timeout'), ms);
	});
	try {
		return await Promise.race([wait.then(() => 'done' as const), timeout]);
	} finally {
		clearTimeout(timer);
	}
}
