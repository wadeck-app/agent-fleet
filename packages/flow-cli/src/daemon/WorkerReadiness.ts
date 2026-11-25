import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import { type ReadinessAnswer, WORKER_FEATURE_READINESS } from '../ipc/Protocol';
import type { StepDeferral } from '../storage/ExecutionTransition';
import type { ReadyStep } from './ReadyStepQueue.js';
import { RetryBackoff } from './RetryBackoff.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

/** The three timers of the readiness question, in milliseconds. They are distinct and independently configured. */
export interface ReadinessSettings {
	/** Phase 1: how long the worker has to say `readiness_alive` (`worker.readinessAckSeconds`). */
	ackMs: number;
	/** Phase 2: how long an acknowledged worker has to send its verdict (`worker.readinessAnswerSeconds`, at most 60 s). */
	answerMs: number;
	/** How long a step is kept queued while not ready before it fails (`worker.notReadyMaxWaitSeconds`). */
	notReadyMaxWaitMs: number;
}

export const DEFAULT_READINESS_SETTINGS: ReadinessSettings = {
	ackMs: 3_000,
	answerMs: 60_000,
	notReadyMaxWaitMs: 900_000,
};

/** Least time before a worker is asked again, whatever it says: no worker can make the daemon ask in a loop. */
export const MIN_RETRY_AFTER_SECONDS = 5;
/** Used when the worker gives no usable `retryAfter` and after the daemon's own timeouts. */
export const DEFAULT_RETRY_AFTER_SECONDS = 30;
/** Longest worker text kept (reason code and message), so a worker cannot flood the log or an event. */
const MAX_REASON_CHARS = 100;
const MAX_MESSAGE_CHARS = 500;

/** What the dispatcher is told, once per step when it first gets deferred and again when the reason changes. */
export interface DeferralReport {
	executionId: string;
	stepId: string;
	workerId: string;
	deferral: StepDeferral;
	/** `worker.notReadyMaxWaitSeconds`, for the log line. */
	maxWaitSeconds: number;
}

/** A question the worker has not finished answering. */
interface OpenAsk {
	requestId: string;
	ws: WebSocket;
	stepKey: string;
	executionId: string;
	stepId: string;
	/** `ack`: waiting for `readiness_alive` (a verdict is accepted too); `answer`: acknowledged, waiting for the verdict. */
	phase: 'ack' | 'answer';
	timer: ReturnType<typeof setTimeout>;
}

/** Why a step is kept queued, per step. The clock (`since`) runs from the first deferral until the step is handed out. */
interface Deferral {
	since: number;
	reason: string;
	message: string;
	phase: StepDeferral['phase'];
	workerId: string;
	workerSource?: string;
	/** Earliest time each worker may be asked again for this step. */
	retryAt: Map<WebSocket, number>;
	/** Reason code last reported (log + event): the next report happens only when it changes. */
	reportedReason?: string;
	timer?: ReturnType<typeof setTimeout>;
}

/** How a dispatch pass must treat the step on the worker it chose. */
export type ReadinessConsultation = 'go' | 'wait';

/** What the daemon did with a message about a question: it matched an open one, or it did not (late, cancelled, not its sender's). */
export type ReadinessMessageOutcome = 'accepted' | 'ignored';

/**
 * The optional "are you ready?" question asked of a worker BEFORE a step is assigned to it.
 *
 * Only workers declaring {@link WORKER_FEATURE_READINESS} are asked; for any other worker {@link consult} says `go` at once and
 * nothing changes. The dispatch pass itself stays synchronous and never waits: it starts the question and the step simply stays
 * queued; the answer, or a timer, triggers the next pass (`onChange`).
 *
 * Two phases per question, each with its own deadline: `readiness_alive` (ack), then `readiness_answer` (`ready` | `not_ready`).
 * A third timer, the bounded wait ({@link expiredFailure}), fails a step that stayed deferred for too long. A `ready` becomes a
 * "verdict" that reserves the worker for that step until the pass that follows consumes it ({@link endPass} drops the rest), so
 * no other step is handed to a worker between its answer and the assignment.
 *
 * A worker with an open question is reserved too ({@link isReserved}): nothing else is sent to it, while other idle workers may
 * take the step meanwhile (a step handed elsewhere cancels its other questions: {@link clearStep}).
 *
 * State is dropped when the step is handed out, when its execution is over ({@link forgetExecution}), when the worker goes
 * ({@link workerGone}) and when the daemon stops ({@link stop}); every timer is cleared with it.
 */
export class WorkerReadiness {
	private readonly asks = new Map<string, OpenAsk>();
	private readonly asksByWorker = new Map<WebSocket, OpenAsk>();
	/** Workers that answered `ready`, with the step they were asked about. */
	private readonly verdicts = new Map<WebSocket, string>();
	private readonly deferrals = new Map<string, Deferral>();
	private readonly retryBackoff = new RetryBackoff('[WorkerReadiness]', 5_000);
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;

	/**
	 * @param onChange Runs a dispatch pass; called when an answer, a timeout or a retry time may let a step move on.
	 * @param report Told once per step when it first gets deferred, and again only when the reason changes.
	 */
	constructor(
		private readonly registry: WorkerRegistry,
		private readonly settings: ReadinessSettings,
		private readonly onChange: () => void,
		private readonly report: (report: DeferralReport) => void,
		private readonly now: () => number = Date.now
	) {}

	/** Number of open questions (for tests and diagnostics). */
	get openAskCount(): number {
		return this.asks.size;
	}

	/** Number of steps currently kept back. */
	get deferredCount(): number {
		return this.deferrals.size;
	}

	/** True when the worker takes part in readiness. */
	supports(ws: WebSocket): boolean {
		return this.registry.describe(ws)?.features.includes(WORKER_FEATURE_READINESS) === true;
	}

	/**
	 * True when the worker must not be offered to the step: a question is open on it, or it holds the `ready` verdict of another
	 * step.
	 */
	isReserved(ws: WebSocket, stepKey: string): boolean {
		return this.asksByWorker.has(ws) || (this.verdicts.has(ws) && this.verdicts.get(ws) !== stepKey);
	}

	/** The worker that answered `ready` for this step and has not been given it yet. */
	verdictWorkerOf(stepKey: string): WebSocket | undefined {
		for (const [ws, key] of this.verdicts) {
			if (key === stepKey) {
				return ws;
			}
		}
		return undefined;
	}

	/** True when this worker said not ready for this step and its retry time has not come. */
	isBlocked(ws: WebSocket, stepKey: string): boolean {
		const retryAt = this.deferrals.get(stepKey)?.retryAt.get(ws);
		return retryAt !== undefined && retryAt > this.now();
	}

	/** True while the step waits for a question to be answered or for a retry time: it must not count as unmet demand. */
	isHeld(stepKey: string): boolean {
		for (const ask of this.asks.values()) {
			if (ask.stepKey === stepKey) {
				return true;
			}
		}
		const deferral = this.deferrals.get(stepKey);
		if (deferral === undefined) {
			return false;
		}
		const now = this.now();
		return [...deferral.retryAt.values()].some(retryAt => retryAt > now);
	}

	/**
	 * What to do with the step on the worker the router chose: hand it out (`go`: the worker does not take part in readiness,
	 * or just said `ready`), or leave it queued (`wait`: a question was started, or is open).
	 */
	consult(ws: WebSocket, step: ReadyStep, tool: 'claude' | 'codex' | 'opencode' | undefined): ReadinessConsultation {
		const stepKey = keyOfStep(step);
		if (!this.supports(ws)) {
			return 'go';
		}
		if (this.verdicts.get(ws) === stepKey) {
			this.verdicts.delete(ws);
			return 'go';
		}
		if (this.asksByWorker.has(ws)) {
			return 'wait';
		}
		this.ask(ws, step, stepKey, tool);
		return 'wait';
	}

	/** The step is being handed out (or is gone): its questions, verdicts and deferral are dropped, with their timers. */
	clearStep(stepKey: string): void {
		for (const ask of [...this.asks.values()]) {
			if (ask.stepKey === stepKey) {
				this.closeAsk(ask);
			}
		}
		for (const [ws, key] of [...this.verdicts]) {
			if (key === stepKey) {
				this.verdicts.delete(ws);
			}
		}
		const deferral = this.deferrals.get(stepKey);
		if (deferral !== undefined) {
			clearTimeout(deferral.timer);
			this.deferrals.delete(stepKey);
		}
	}

	/**
	 * The failure of a step kept back for the whole bounded wait, or undefined while it may still wait. Clears the step.
	 */
	expiredFailure(step: ReadyStep, maskText: (text: string) => string): string | undefined {
		const stepKey = keyOfStep(step);
		const deferral = this.deferrals.get(stepKey);
		if (deferral === undefined || this.now() - deferral.since < this.settings.notReadyMaxWaitMs) {
			return undefined;
		}
		this.clearStep(stepKey);
		const waited = Math.round((this.now() - deferral.since) / 1000);
		const max = Math.round(this.settings.notReadyMaxWaitMs / 1000);
		return (
			`Step "${step.stepId}" was not started: worker ${deferral.workerId} was not ready for ${String(waited)}s ` +
			`(bounded wait of a step kept queued while not ready: worker.notReadyMaxWaitSeconds = ${String(max)}s). ` +
			`Last reason (${describePhase(deferral.phase, this.settings)}): ${maskText(deferral.reason)} -- ${maskText(deferral.message)}. ` +
			`Fix the cause on that worker, or raise worker.notReadyMaxWaitSeconds in the daemon config if it needs longer.`
		);
	}

	/** Ends a dispatch pass: a `ready` the pass did not use (step paused, over, or no longer routable) must not hold its worker. */
	endPass(): void {
		this.verdicts.clear();
	}

	/** `readiness_alive`: the worker is checking. Duplicates are accepted and change nothing. */
	handleAlive(ws: WebSocket, requestId: string): ReadinessMessageOutcome {
		const ask = this.openAskOf(ws, requestId);
		if (ask === undefined) {
			return 'ignored';
		}
		if (ask.phase === 'ack') {
			clearTimeout(ask.timer);
			ask.phase = 'answer';
			ask.timer = this.startTimer(this.settings.answerMs, () => this.expire(ask));
		}
		return 'accepted';
	}

	/**
	 * `readiness_answer`. Accepted in either phase (a verdict without an ack counts while the ack deadline runs). A malformed
	 * answer is a `not_ready` (reason `invalid-readiness-answer`), never a `ready`.
	 */
	handleAnswer(ws: WebSocket, requestId: string, answer: unknown): ReadinessMessageOutcome {
		const ask = this.openAskOf(ws, requestId);
		if (ask === undefined) {
			return 'ignored';
		}
		this.closeAsk(ask);
		const verdict = parseAnswer(answer);
		if (verdict.result === 'ready') {
			this.verdicts.set(ws, ask.stepKey);
			this.notify();
			return 'accepted';
		}
		this.defer(ask, verdict.reason, verdict.message, 'worker', verdict.retryAfter);
		return 'accepted';
	}

	/** The worker disconnected: its question, verdict and retry times go. The step stays queued and is placed again. */
	workerGone(ws: WebSocket): void {
		const ask = this.asksByWorker.get(ws);
		if (ask !== undefined) {
			this.closeAsk(ask);
		}
		this.verdicts.delete(ws);
		for (const [stepKey, deferral] of [...this.deferrals]) {
			deferral.retryAt.delete(ws);
			if (deferral.retryAt.size === 0 && !this.hasOpenAskFor(stepKey)) {
				clearTimeout(deferral.timer);
				this.deferrals.delete(stepKey);
			} else {
				this.schedule(stepKey);
			}
		}
	}

	/** Drops everything about the steps of an execution that is over. */
	forgetExecution(executionId: string): void {
		const prefix = `${executionId}:`;
		const keys = new Set<string>();
		for (const ask of this.asks.values()) {
			keys.add(ask.stepKey);
		}
		for (const key of [...this.deferrals.keys(), ...this.verdicts.values()]) {
			keys.add(key);
		}
		for (const key of keys) {
			if (key.startsWith(prefix)) {
				this.clearStep(key);
			}
		}
	}

	/** Drops every question and timer, for the daemon stop: nothing may fire against collaborators that are torn down. */
	stop(): void {
		this.stopped = true;
		for (const ask of [...this.asks.values()]) {
			this.closeAsk(ask);
		}
		for (const deferral of this.deferrals.values()) {
			clearTimeout(deferral.timer);
		}
		this.deferrals.clear();
		this.verdicts.clear();
		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
	}

	private ask(
		ws: WebSocket,
		step: ReadyStep,
		stepKey: string,
		tool: 'claude' | 'codex' | 'opencode' | undefined
	): void {
		const requestId = randomUUID();
		const sent = this.registry.send(ws, {
			type: 'readiness_request',
			requestId,
			executionId: step.executionContext.executionId,
			stepId: step.stepId,
			...(tool === undefined ? {} : { tool }),
		});
		if (!sent) {
			// Same as a failed assignment: the socket is gone, the close event follows and a pass places the step again.
			this.registry.remove(ws);
			return;
		}
		const ask: OpenAsk = {
			requestId,
			ws,
			stepKey,
			executionId: step.executionContext.executionId,
			stepId: step.stepId,
			phase: 'ack',
			timer: this.startTimer(this.settings.ackMs, () => this.expire(ask)),
		};
		this.asks.set(requestId, ask);
		this.asksByWorker.set(ws, ask);
	}

	/** The deadline of the current phase passed: the worker did not do its part, so the step is not ready. Never `ready`. */
	private expire(ask: OpenAsk): void {
		if (!this.asks.has(ask.requestId)) {
			return;
		}
		const phase = ask.phase;
		this.closeAsk(ask);
		if (phase === 'ack') {
			const seconds = String(Math.round(this.settings.ackMs / 1000));
			this.defer(
				ask,
				'worker-unresponsive',
				`the worker did not acknowledge the readiness question within ${seconds}s`,
				'ack',
				DEFAULT_RETRY_AFTER_SECONDS
			);
			return;
		}
		const seconds = String(Math.round(this.settings.answerMs / 1000));
		this.defer(
			ask,
			'no-readiness-answer-in-time',
			`the worker acknowledged but gave no readiness answer within ${seconds}s`,
			'answer',
			DEFAULT_RETRY_AFTER_SECONDS
		);
	}

	private defer(
		ask: OpenAsk,
		reason: string,
		message: string,
		phase: StepDeferral['phase'],
		retryAfterRaw: number
	): void {
		const registered = this.registry.describe(ask.ws);
		const retryAfterSeconds = this.clampRetryAfter(retryAfterRaw);
		const now = this.now();
		const deferral = this.deferrals.get(ask.stepKey) ?? {
			since: now,
			reason,
			message,
			phase,
			workerId: registered?.workerId ?? 'unknown',
			retryAt: new Map<WebSocket, number>(),
		};
		deferral.reason = reason;
		deferral.message = message;
		deferral.phase = phase;
		deferral.workerId = registered?.workerId ?? deferral.workerId;
		if (registered?.sourceId !== undefined) {
			deferral.workerSource = registered.sourceId;
		}
		deferral.retryAt.set(ask.ws, now + retryAfterSeconds * 1000);
		this.deferrals.set(ask.stepKey, deferral);
		this.schedule(ask.stepKey);
		if (deferral.reportedReason !== reason) {
			deferral.reportedReason = reason;
			this.report({
				executionId: ask.executionId,
				stepId: ask.stepId,
				workerId: deferral.workerId,
				maxWaitSeconds: Math.round(this.settings.notReadyMaxWaitMs / 1000),
				deferral: {
					reason,
					message,
					phase,
					retryAfterSeconds,
					...(deferral.workerSource === undefined ? {} : { workerSource: deferral.workerSource }),
				},
			});
		}
		this.notify();
	}

	/** `retryAfter` as the earliest time to ask again: at least {@link MIN_RETRY_AFTER_SECONDS}, at most the bounded wait. */
	private clampRetryAfter(raw: number): number {
		const requested = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : DEFAULT_RETRY_AFTER_SECONDS;
		const cap = Math.max(1, Math.floor(this.settings.notReadyMaxWaitMs / 1000));
		return Math.min(cap, Math.max(MIN_RETRY_AFTER_SECONDS, requested));
	}

	/** One timer per deferred step, set to the earliest of its retry times and the end of its bounded wait. */
	private schedule(stepKey: string): void {
		const deferral = this.deferrals.get(stepKey);
		if (deferral === undefined || this.stopped) {
			return;
		}
		clearTimeout(deferral.timer);
		const next = Math.min(deferral.since + this.settings.notReadyMaxWaitMs, ...deferral.retryAt.values());
		deferral.timer = this.startTimer(Math.max(0, next - this.now()), () => {
			deferral.timer = undefined;
			this.notify();
		});
	}

	private openAskOf(ws: WebSocket, requestId: string): OpenAsk | undefined {
		const ask = this.asks.get(requestId);
		return ask !== undefined && ask.ws === ws ? ask : undefined;
	}

	private hasOpenAskFor(stepKey: string): boolean {
		return [...this.asks.values()].some(ask => ask.stepKey === stepKey);
	}

	private closeAsk(ask: OpenAsk): void {
		clearTimeout(ask.timer);
		this.asks.delete(ask.requestId);
		if (this.asksByWorker.get(ask.ws) === ask) {
			this.asksByWorker.delete(ask.ws);
		}
	}

	private startTimer(delayMs: number, action: () => void): ReturnType<typeof setTimeout> {
		const timer = setTimeout(action, delayMs);
		// Never the reason the daemon stays up: idle shutdown is decided elsewhere.
		timer.unref?.();
		return timer;
	}

	/**
	 * Asks for a dispatch pass. A pass that throws is reported (never swallowed) and asked for again after a growing delay: the
	 * deferred steps and the open questions have no other timer that would notice.
	 */
	private notify(): void {
		if (this.stopped) {
			return;
		}
		try {
			this.onChange();
			this.retryBackoff.succeeded();
		} catch (err) {
			const retryMs = this.retryBackoff.failed('dispatch pass after a readiness event', err);
			clearTimeout(this.retryTimer);
			this.retryTimer = this.startTimer(retryMs, () => this.notify());
		}
	}
}

/** `executionId:stepId`, the identity of a queued step. */
export function keyOfStep(step: ReadyStep): string {
	return `${step.executionContext.executionId}:${step.stepId}`;
}

/** Which timer produced the reason, named with its config key, for the texts a user reads. */
function describePhase(phase: StepDeferral['phase'], settings: ReadinessSettings): string {
	switch (phase) {
		case 'ack':
			return `alive ack, worker.readinessAckSeconds = ${String(Math.round(settings.ackMs / 1000))}s`;
		case 'answer':
			return `readiness answer, worker.readinessAnswerSeconds = ${String(Math.round(settings.answerMs / 1000))}s`;
		case 'worker':
			return 'the worker said not ready';
		default: {
			const unreachable: never = phase;
			throw new Error(`Unknown readiness phase ${String(unreachable)}`);
		}
	}
}

/** Reads what a worker sent; anything that is not a well-formed `ready` or `not_ready` is a not_ready, never a `ready`. */
function parseAnswer(raw: unknown): ReadinessAnswer & { result: string } {
	const answer = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	if (answer['result'] === 'ready') {
		return { result: 'ready' };
	}
	if (answer['result'] === 'not_ready') {
		const { reason, message, retryAfter } = answer;
		if (
			typeof reason === 'string' &&
			reason.trim() !== '' &&
			typeof message === 'string' &&
			message.trim() !== ''
		) {
			return {
				result: 'not_ready',
				reason: reason.trim().slice(0, MAX_REASON_CHARS),
				message: message.trim().slice(0, MAX_MESSAGE_CHARS),
				retryAfter: typeof retryAfter === 'number' ? retryAfter : Number.NaN,
			};
		}
		return malformed('a not_ready answer needs a non-empty string "reason" and "message"');
	}
	return malformed(`"result" must be "ready" or "not_ready", got ${JSON.stringify(answer['result'])}`);
}

function malformed(detail: string): ReadinessAnswer & { result: 'not_ready' } {
	return {
		result: 'not_ready',
		reason: 'invalid-readiness-answer',
		message: `the worker sent a malformed readiness answer (${detail})`,
		retryAfter: DEFAULT_RETRY_AFTER_SECONDS,
	};
}
