import type { WebSocket } from 'ws';

import type { SourceReady, WorkerToDaemon } from '../ipc/Protocol';
import { writeDaemonLog } from './DaemonLog.js';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { injectedStepState } from './InjectedStepState.js';
import type { WorkerConnectionLogs } from './WorkerConnectionLogs.js';
import { WorkerConnectionTracker } from './WorkerConnectionTracker.js';

const MAX_LOGGED_TYPE_LENGTH = 64;

/** The type of a message for a log line: quoted, cut, and a placeholder when it is not a string. Never anything else of the message. */
function describeMessageType(message: unknown): string {
	const type = typeof message === 'object' && message !== null ? (message as { type?: unknown }).type : undefined;
	if (typeof type !== 'string') {
		return `<${message === null ? 'null' : typeof message === 'object' ? 'no string type' : typeof message}>`;
	}
	return JSON.stringify(type.length > MAX_LOGGED_TYPE_LENGTH ? `${type.slice(0, MAX_LOGGED_TYPE_LENGTH)}...` : type);
}

function errorSummary(err: unknown): string {
	return err instanceof Error ? `${err.name}: ${err.message}` : 'a non-Error value was thrown';
}

/** Reacts to what connected workers and relays say, and to their sockets closing. */
export class DaemonWorkerMessageHandler {
	/** Workers already warned about for reporting a failure without metrics: once each, not once per failure. */
	private readonly warnedWithoutMetrics = new WeakSet<WebSocket>();

	constructor(
		private readonly logsDir: string,
		private readonly runtime: () => DaemonRuntime,
		/** Called after anything that may have left the daemon with nothing to do. */
		private readonly checkShutdown: () => void,
		/** Remembers what each connection last said, so a disconnect can be explained. */
		private readonly connections: WorkerConnectionTracker = new WorkerConnectionTracker(),
		/** The per-worker logs of workers the daemon did not fork; absent = they are not kept. */
		private readonly workerLogs?: WorkerConnectionLogs
	) {}

	/**
	 * A message the daemon cannot handle (unknown type from a newer worker, wrong shape, a handler that throws) is
	 * logged and dropped: it must never reach the socket's event emitter, where an exception becomes an uncaughtException
	 * that takes the daemon down with every other worker's work. The connection stays open.
	 *
	 * The log names the worker and the message type only: the body can hold secrets.
	 */
	handleMessage(ws: WebSocket, message: WorkerToDaemon): void {
		try {
			this.dispatchMessage(ws, message);
		} catch (err) {
			const line = `Worker ${this.describeSender(ws)}: message of type ${describeMessageType(message)} not handled, dropped (connection kept): ${errorSummary(err)}`;
			process.stderr.write(`[daemon] ${line}
`);
			writeDaemonLog(this.logsDir, 'error', line);
		}
	}

	/** The worker id, or 'unregistered' (also when the registry cannot say: this runs while reporting a failure). */
	private describeSender(ws: WebSocket): string {
		try {
			return this.runtime().workerRegistry.describe(ws)?.workerId ?? 'unregistered';
		} catch {
			return 'unregistered';
		}
	}

	private dispatchMessage(ws: WebSocket, message: WorkerToDaemon): void {
		if (
			typeof message !== 'object' ||
			message === null ||
			typeof (message as { type?: unknown }).type !== 'string'
		) {
			throw new Error('the message has no string "type" field');
		}
		// Output the worker ships is not a sign of what it was doing: it must not become the "last message" of a disconnect report.
		if (message.type === 'worker_log') {
			this.workerLogs?.ship(ws, message);
			return;
		}
		this.connections.noteMessage(ws, message as { type: string; executionId?: string; stepId?: string });
		// A relay registering as a source arrives on the same listener but is not a worker: it
		// presents a different credential and is never dispatched to (T-04, T-11).
		if ((message as { type?: string }).type === 'source_ready') {
			this.handleSourceRegistration(ws, message as unknown as SourceReady);
			return;
		}

		switch (message.type) {
			case 'ready': {
				const { workerProvisioner, commandHandler } = this.runtime();
				// Refused registrations are already reported and the socket terminated;
				// dispatching afterwards would target a worker that was rejected.
				if (!workerProvisioner.registerWorker(ws, message)) {
					break;
				}
				this.openWorkerLog(ws);
				commandHandler.tryDispatch();
				this.checkShutdown();
				break;
			}
			case 'step_completed': {
				this.handleStepCompleted(ws, message);
				break;
			}
			case 'step_failed': {
				this.handleStepFailed(ws, message);
				break;
			}
			case 'log': {
				this.handleLog(ws, message);
				break;
			}
			case 'step_started': {
				// Only changes how a later disconnect is classified (D#65); nothing else acts on it.
				const { assignmentId, executionId, stepId } = message;
				this.runtime().commandHandler.onStepStarted(ws, assignmentId, executionId, stepId);
				this.workerLogs?.note(ws, `step ${stepId} started (execution ${executionId})`);
				break;
			}
			case 'step_progress': {
				// Carries no content -- unlike 'log', this is never written to the execution log,
				// only used to reset the silence clock and to remember which tool call the step is in
				// (see Protocol.ts for why this exists).
				const { assignmentId, executionId, stepId, activity, lastCompletedTool, finalResultAt } = message;
				const { commandHandler } = this.runtime();
				if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) {
					break;
				}
				// Only the fields the worker actually sent: `undefined` and `null` mean different things.
				commandHandler.noteAssignmentActivity(assignmentId, {
					...(activity !== undefined && { activity }),
					...(lastCompletedTool !== undefined && { lastCompletedTool }),
					...(finalResultAt !== undefined && { finalResultAt }),
				});
				break;
			}
			case 'inject_steps': {
				this.handleInjectSteps(ws, message);
				break;
			}
			case 'run_end_ack': {
				this.runtime().commandHandler.onRunEndAck(ws, message.executionId);
				break;
			}
			default: {
				const _exhaustive: never = message;
				// Only the type: the rest of the message can hold secrets and ends up in the daemon log.
				throw new Error(`Unknown worker message type ${describeMessageType(_exhaustive)}`);
			}
		}
	}

	/** @param code Close code the connection ended with (1006 when no close frame arrived). */
	handleClose(ws: WebSocket, code: number, reason: string): void {
		const { commandHandler, workerRegistry, relayRegistry } = this.runtime();
		// Read before the registry forgets the socket: the id is what ties this line to the worker's other log lines.
		const registered = workerRegistry.describe(ws);
		const report = this.connections.describeClose(ws, {
			code,
			reason,
			...(registered !== undefined && { workerId: registered.workerId, pid: registered.pid }),
		});
		writeDaemonLog(this.logsDir, report.lostStartedStep ? 'error' : 'info', report.logLine);
		this.workerLogs?.close(ws, report.logLine);
		// A disconnected worker can no longer report on its assignments; leaving them
		// outstanding would let a reconnecting socket be matched against stale work.
		// Classifies each interrupted step and re-queues the ones that never started (D#65).
		commandHandler.handleWorkerDisconnect(ws, report.noteForStep);
		// Only dispatch once this socket is out of the registry, or a re-queued step could
		// go straight back to the worker that just vanished.
		workerRegistry.remove(ws);
		// The same listener carries relays. Dropping one costs no in-flight work -- a relay runs
		// no steps -- but leaving it recorded would have the daemon ask a dead socket for
		// workers and report the source as merely unproductive.
		relayRegistry.remove(ws);
		commandHandler.tryDispatch();
		this.checkShutdown();
	}

	/** Starts the log of a worker the daemon did not fork and, when it can ship its output, tells it so (once per connection). */
	private openWorkerLog(ws: WebSocket): void {
		if (this.workerLogs === undefined) {
			return;
		}
		const { workerRegistry } = this.runtime();
		const registered = workerRegistry.describe(ws);
		if (registered !== undefined && this.workerLogs.open(ws, registered)) {
			workerRegistry.send(ws, { type: 'worker_logs_enabled' });
		}
	}

	private handleStepCompleted(ws: WebSocket, message: Extract<WorkerToDaemon, { type: 'step_completed' }>): void {
		const { commandHandler, executionStore, logWriter } = this.runtime();
		try {
			const { assignmentId, executionId, stepId, output, meta, io, truncated } = message;
			if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) {
				return;
			}
			// The outcome is accepted from here on, so the assignment is closed and
			// the same result cannot be replayed.
			commandHandler.settleAssignment(assignmentId);
			this.workerLogs?.note(ws, `step ${stepId} completed (execution ${executionId})`);
			executionStore.markStepCompleted(executionId, stepId, meta, {
				capture: io,
				outputs: output,
				...(truncated !== undefined && truncated.length > 0 && { truncated }),
			});
			if (truncated !== undefined && truncated.length > 0) {
				const dropped = truncated.reduce((sum, t) => sum + t.originalBytes - t.keptBytes, 0);
				logWriter.writeExecution(
					executionId,
					`Step ${stepId}: the worker cut ${String(dropped)} bytes of its result to fit the message limit (${truncated.map(t => t.field).join(', ')}); the declared outputs are intact. Later steps reading these fields see the cut text.`,
					'warning'
				);
			}
			commandHandler.onStepCompleted(executionId, stepId, output, meta);
			logWriter.writeExecution(executionId, `Step ${stepId} completed`);
			commandHandler.dispatchHook(executionId, 'onStepEnd', { executionId, stepId });

			const state = executionStore.read(executionId);
			// The store alone cannot tell "settled" from "a failed step is about to be re-run"
			// (sub-step restart, retry, loop): a step that failed earlier still reads failed
			// until its next attempt starts. While the scheduler has work left, nothing is final.
			const allDone =
				!commandHandler.isExecutionActive(executionId) &&
				Object.values(state.steps).every(s => s.status === 'completed' || s.status === 'failed');
			if (allDone) {
				if (Object.values(state.steps).every(s => s.status === 'completed')) {
					executionStore.markExecutionCompleted(executionId);
					logWriter.writeExecution(executionId, `Execution completed`);
					commandHandler.dispatchHook(executionId, 'onFlowEnd', { executionId });
				} else {
					executionStore.markExecutionFailed(executionId);
					logWriter.writeExecution(executionId, `Execution failed`, 'error');
					commandHandler.dispatchHook(executionId, 'onFlowError', { executionId });
				}
				commandHandler.removeExecutionHooks(executionId);
			}

			// Try to dispatch newly ready steps
			commandHandler.tryDispatch();
		} catch (err) {
			process.stderr.write(`[daemon] step_completed handler error: ${String(err)}\n`);
			writeDaemonLog(this.logsDir, 'error', `step_completed handler error: ${String(err)}`);
		}
	}

	private handleStepFailed(ws: WebSocket, message: Extract<WorkerToDaemon, { type: 'step_failed' }>): void {
		const { commandHandler, executionStore, logWriter, daemonSecrets } = this.runtime();
		try {
			const {
				assignmentId,
				executionId,
				stepId,
				error: reportedError,
				output,
				stdout,
				stderr,
				io,
				meta,
				origin,
			} = message;
			// The worker already masked it; this is the daemon's own pass, before hooks and logs see it.
			const error = daemonSecrets.masks.mask(executionId, reportedError);
			if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) {
				return;
			}
			commandHandler.settleAssignment(assignmentId);
			this.workerLogs?.note(ws, `step ${stepId} failed (execution ${executionId}): ${error.slice(0, 500)}`);
			this.warnOnceIfNoMetrics(ws, executionId, stepId, meta);
			executionStore.markStepFailed(
				executionId,
				stepId,
				error,
				stdout,
				stderr,
				{ capture: io, outputs: output ?? {} },
				// Undefined meta is recorded as such (attempt without metrics), never as a zero cost
				// A failure the worker declared deterministic is recorded as the engine's, like one the daemon decides itself
				{ meta, ...(origin === 'engine' && { engineEndReason: 'engine_failed' as const }) }
			);
			if (origin === undefined) {
				commandHandler.onStepFailed(executionId, stepId, error, output);
			} else {
				commandHandler.onStepFailed(executionId, stepId, error, output, origin);
			}
			// markExecutionFailed is now called inside onStepFailed only when the failure is terminal
			logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, 'error');
			commandHandler.dispatchHook(executionId, 'onStepFailed', { executionId, stepId, error });
		} catch (err) {
			process.stderr.write(`[daemon] step_failed handler error: ${String(err)}\n`);
			writeDaemonLog(this.logsDir, 'error', `step_failed handler error: ${String(err)}`);
		}
	}

	/**
	 * A failure with no meta is recorded without cost or duration details. Said once per worker in the execution log, with
	 * the way out: the usual cause is a worker built before failed attempts reported their metrics.
	 */
	private warnOnceIfNoMetrics(ws: WebSocket, executionId: string, stepId: string, meta: unknown): void {
		if (meta !== undefined || this.warnedWithoutMetrics.has(ws)) {
			return;
		}
		this.warnedWithoutMetrics.add(ws);
		const worker = this.runtime().workerRegistry.describe(ws);
		this.runtime().logWriter.writeExecution(
			executionId,
			`Step ${stepId} failed without attempt metrics from worker ${worker?.workerId ?? 'unknown'} (flow-cli ${worker?.version ?? 'unknown version'}): ` +
				'its cost and duration are not recorded for this attempt. A worker built before failed attempts reported metrics causes this: update it with `flow cli update` and restart it. ' +
				'This is said once per worker.',
			'warning'
		);
	}

	private handleLog(ws: WebSocket, message: Extract<WorkerToDaemon, { type: 'log' }>): void {
		const { commandHandler, logWriter } = this.runtime();
		try {
			const { assignmentId, executionId, stepId, entry } = message;
			// Logs are bound too: they land in another execution's log file otherwise.
			if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) {
				return;
			}
			// Output is the proof a step is still working: a wedged worker keeps its socket
			// open and answers pings, so silence is the only signal there is.
			commandHandler.noteAssignmentActivity(assignmentId);
			logWriter.write(executionId, stepId, entry);
		} catch (err) {
			process.stderr.write(`[daemon] log handler error: ${String(err)}\n`);
		}
	}

	private handleInjectSteps(ws: WebSocket, message: Extract<WorkerToDaemon, { type: 'inject_steps' }>): void {
		const { commandHandler, executionStore, logWriter } = this.runtime();
		const { assignmentId, executionId, steps } = message;
		if (!commandHandler.verifyAssignmentScope(ws, assignmentId, executionId)) {
			return;
		}
		try {
			commandHandler.injectSteps(executionId, steps);
			// H1: also register injected step IDs in ExecutionStore so the allDone check is accurate
			const current = executionStore.read(executionId);
			const newSteps = { ...current.steps };
			for (const s of steps) {
				newSteps[s.id] = injectedStepState(s);
			}
			executionStore.update(executionId, { steps: newSteps });
			commandHandler.tryDispatch();
		} catch (err) {
			logWriter.writeExecution(executionId, `Failed to inject steps: ${String(err)}`, 'error');
		}
	}

	/**
	 * Admits or refuses a relay claiming to be a declared source (D#17, T-11).
	 *
	 * A refusal closes the socket: an unauthenticated peer must not stay connected, and it is
	 * told why, because the honest case -- a mistyped source id or the worker token used by
	 * mistake -- is indistinguishable from an attack at this point.
	 */
	private handleSourceRegistration(ws: WebSocket, ready: SourceReady): void {
		const admission = this.runtime().relayRegistry.register(ws, ready);
		if (!admission.ok) {
			process.stderr.write(`[daemon] ${admission.reason}\n`);
			writeDaemonLog(this.logsDir, 'error', admission.reason);
			ws.terminate();
			return;
		}
		const note = `relay registered for source "${admission.relay.sourceId}" with capacity ${String(admission.relay.capacity)}`;
		writeDaemonLog(this.logsDir, 'info', note);
		// Registering a relay creates no capacity by itself: it is a process that *can* make
		// workers, and only a worker's own connection proves one exists (D#4). Dispatch is
		// therefore not retried here.
	}
}
