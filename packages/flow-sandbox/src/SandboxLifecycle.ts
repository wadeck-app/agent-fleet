import { describeError } from './ErrorText';
import { FailedCreateCleanup } from './FailedCreateCleanup';
import type { RunMounts } from './RunMounts';
import { RunSandboxName } from './RunSandboxName';
import { SandboxError } from './SandboxError';
import {
	type Held,
	type HeldSandbox,
	type RunEndReason,
	type SandboxLifecycleDependencies,
	type SandboxLifecycleOptions,
	type StepContext,
	type StepRequest,
	validateLifecycleOptions,
} from './SandboxLifecycleTypes';
import type { CancelScheduled } from './Scheduler';
import { SerialQueue } from './SerialQueue';

export type {
	HeldSandbox,
	HeldSandboxStatus,
	RunEndReason,
	SandboxLifecycleDependencies,
	SandboxLifecycleOptions,
	StepContext,
	StepRequest,
} from './SandboxLifecycleTypes';

const ENDED_RUNS_REMEMBERED = 256;

/**
 * The sandbox of ONE worker. Rules:
 * - one sandbox at a time: it is created at the first step of a run and a step of another run is refused
 *   (`worker-busy`) until the first run ends;
 * - it is REMOVED only by `endRun` (end-of-run or cancel event; `daemon_stopping` only stops it); idle, step timeout, `shutdown` (wrapper exit
 *   or restart) and failures only STOP it;
 * - the idle timer is cleared when a step starts and re-armed when it ends; when it fires the sandbox is
 *   stopped, and the next step restarts it (`SandboxRuntime.start`, an `exec true`: sbx has no start verb);
 * - a step that times out is failed and the sandbox is stopped, because aborting `exec` on the host leaves the
 *   process running in the VM;
 * - `endRun` is idempotent (the event can arrive twice) and a step arriving after it is refused (`run-ended`);
 * - every state change goes through one queue, so create, stop and remove never interleave, whatever order
 *   timers, steps and events arrive in.
 *
 * sbx itself stops an idle VM after ~30 s; the wrapper timer matters when a session stays open (relay variant).
 */
export class SandboxLifecycle {
	private readonly queue = new SerialQueue();
	private readonly ended = new Set<string>();
	private readonly createCleanup: FailedCreateCleanup;
	private held: Held | undefined;
	private started = false;
	private closed = false;

	constructor(
		private readonly options: SandboxLifecycleOptions,
		private readonly dependencies: SandboxLifecycleDependencies
	) {
		validateLifecycleOptions(options);
		this.createCleanup = new FailedCreateCleanup(dependencies.runtime, dependencies.log);
	}

	/** Announces this wrapper (presence). Must be called once before the first step. */
	start(): void {
		if (this.closed) throw new SandboxError('invalid-argument', this.closedMessage());
		this.started = true;
		this.dependencies.presence.publish(this.options.wrapperId, undefined);
	}

	/** The sandbox currently held by this worker, if any. */
	current(): HeldSandbox | undefined {
		const held = this.held;
		if (held === undefined) return undefined;
		return { executionId: held.executionId, name: held.name, status: held.status, stepActive: held.stepActive };
	}

	/** Resolves when every queued operation (including idle stops started by a timer) has finished. */
	whenSettled(): Promise<void> {
		return this.queue.run(() => Promise.resolve());
	}

	/**
	 * Runs one step: makes sure the run's sandbox exists and runs, calls `step`, then re-arms the idle timer.
	 * On timeout the step is failed (`timeout` error) and the sandbox stopped; `step` is not awaited any more.
	 */
	async runStep<T>(request: StepRequest, step: (context: StepContext) => Promise<T>): Promise<T> {
		const sandbox = await this.beginStep(request.executionId, request.mounts);
		const controller = new AbortController();
		let cancelTimeout: CancelScheduled | undefined;
		const timeout = new Promise<{ timedOut: true }>(resolve => {
			if (request.timeoutMs === undefined) return;
			cancelTimeout = this.dependencies.scheduler.schedule(request.timeoutMs, () => {
				controller.abort();
				resolve({ timedOut: true });
			});
		});
		const running = step({ sandbox, signal: controller.signal });
		try {
			const outcome = await Promise.race([running.then(value => ({ timedOut: false as const, value })), timeout]);
			if (outcome.timedOut) {
				// The step may still settle later; its outcome no longer matters.
				running.catch(() => undefined);
				await this.stopAfterStepTimeout(request.executionId);
				throw new SandboxError(
					'timeout',
					`The step in sandbox "${sandbox}" exceeded its time limit of ${request.timeoutMs} ms. It was failed and the sandbox was stopped (aborting exec does not kill the process in the VM); the next step restarts it.`,
					{ sandbox }
				);
			}
			await this.endStep(request.executionId);
			return outcome.value;
		} catch (error) {
			if (!controller.signal.aborted) await this.endStep(request.executionId);
			throw error;
		} finally {
			cancelTimeout?.();
		}
	}

	/**
	 * First assignment of a run: creates the sandbox. Later steps: restarts it when stopped. Clears the idle
	 * timer. Returns the sandbox name.
	 */
	beginStep(executionId: string, mounts: RunMounts): Promise<string> {
		return this.queue.run(async () => {
			this.requireUsable();
			const name = RunSandboxName.format(this.options.wrapperId, executionId);
			if (this.ended.has(executionId)) {
				throw new SandboxError(
					'run-ended',
					`Run "${executionId}" already ended: sandbox "${name}" is not created or restarted for a late step.`,
					{ sandbox: name }
				);
			}
			const held = this.held;
			if (held !== undefined && held.executionId !== executionId) {
				throw new SandboxError(
					'worker-busy',
					`This worker already serves run "${held.executionId}" (sandbox "${held.name}"); it cannot take a step of run "${executionId}" until that run ends. One sandbox per worker: route the second run to another worker.`,
					{ sandbox: held.name }
				);
			}
			if (held === undefined) return this.createFor(executionId, name, mounts);
			if (held.stepActive) {
				throw new SandboxError(
					'worker-busy',
					`A step of run "${executionId}" is still active in sandbox "${held.name}": a worker runs one step at a time.`,
					{ sandbox: held.name }
				);
			}
			this.clearIdle(held);
			if (held.status === 'stopped') await this.restart(held);
			held.stepActive = true;
			return held.name;
		});
	}

	/** A step ended: re-arms the idle timer. A late call for a run that is over is ignored. */
	endStep(executionId: string): Promise<void> {
		return this.queue.run(() => {
			const held = this.held;
			if (held === undefined || held.executionId !== executionId || !held.stepActive) {
				this.dependencies.log.info(
					`Step end for run "${executionId}" ignored: no active step of that run on this worker.`
				);
				return Promise.resolve();
			}
			held.stepActive = false;
			if (held.status === 'running') this.armIdle(held);
			return Promise.resolve();
		});
	}

	/**
	 * A step timed out: the caller already failed it; this stops the sandbox so the process in the VM dies.
	 * If the stop fails the idle timer is re-armed to retry and the error is thrown (the process may still run).
	 */
	stopAfterStepTimeout(executionId: string): Promise<void> {
		return this.queue.run(async () => {
			const held = this.held;
			if (held === undefined || held.executionId !== executionId) return;
			this.clearIdle(held);
			held.stepActive = false;
			try {
				await this.stopHeld(held, 'step timeout');
			} catch (error) {
				this.armIdle(held);
				throw error;
			}
		});
	}

	/**
	 * End-of-run or cancel event: removes the run's sandbox. Idempotent. A sandbox that no longer exists counts
	 * as removed. Any other failure keeps the run known so a second event retries.
	 */
	endRun(executionId: string, reason: RunEndReason): Promise<void> {
		return this.queue.run(async () => {
			const held = this.held;
			if (reason === 'daemon_stopping') {
				await this.stopForDaemonStop(executionId, held);
				return;
			}
			if (held === undefined || held.executionId !== executionId) {
				this.rememberEnded(executionId);
				this.dependencies.log.info(
					`Run "${executionId}" ended (${reason}); this worker holds no sandbox for it, nothing to remove.`
				);
				return;
			}
			this.clearIdle(held);
			try {
				await this.dependencies.runtime.remove(held.name);
			} catch (error) {
				if (!(error instanceof SandboxError && error.kind === 'not-found')) {
					this.dependencies.log.warn(
						`Could not remove sandbox "${held.name}" at the end of run "${executionId}" (${reason}): ${describeError(error)}. A second end-of-run event retries; otherwise run \`leftover remove ${held.name}\`.`
					);
					throw error;
				}
			}
			this.dependencies.capacity.release(held.name);
			this.held = undefined;
			this.rememberEnded(executionId);
			if (!this.closed) this.dependencies.presence.publish(this.options.wrapperId, undefined);
			this.dependencies.log.info(`Sandbox "${held.name}" removed: run "${executionId}" ended (${reason}).`);
		});
	}

	/**
	 * The daemon stops while the run is unfinished: the run may be resumed, so the sandbox is STOPPED and kept
	 * (held, not marked ended, never removed). Leftovers are listed and removed by the explicit command.
	 */
	private async stopForDaemonStop(executionId: string, held: Held | undefined): Promise<void> {
		if (held === undefined || held.executionId !== executionId) {
			this.dependencies.log.info(
				`Run "${executionId}" interrupted by a daemon stop (daemon_stopping); this worker holds no sandbox for it, nothing to stop.`
			);
			return;
		}
		this.clearIdle(held);
		held.stepActive = false;
		if (held.status === 'running') await this.stopHeld(held, 'daemon_stopping');
		this.dependencies.log.info(
			`Run "${executionId}" interrupted by a daemon stop (daemon_stopping): sandbox "${held.name}" is kept stopped, not removed. List it with \`leftover list\`, remove it with \`leftover remove ${held.name}\` once the run will not resume.`
		);
	}

	/**
	 * The wrapper exits or restarts: stops the sandbox if it runs, never removes it, withdraws the presence.
	 * Sandboxes left stopped are listed by LeftoverSandboxes and removed only by an explicit command.
	 */
	shutdown(): Promise<void> {
		return this.queue.run(async () => {
			this.closed = true;
			try {
				const held = this.held;
				if (held === undefined) return;
				this.clearIdle(held);
				if (held.status === 'running') await this.stopHeld(held, 'wrapper shutdown');
			} finally {
				this.dependencies.presence.withdraw(this.options.wrapperId);
			}
		});
	}

	private async createFor(executionId: string, name: string, mounts: RunMounts): Promise<string> {
		await this.dependencies.capacity.acquire(name);
		try {
			await this.dependencies.runtime.create({
				name,
				agent: this.options.agent,
				mounts: mounts.sandboxMounts(),
				cpus: this.options.cpus,
				memory: this.options.memory,
				...(this.options.image === undefined ? {} : { image: this.options.image }),
				...(this.options.pull === undefined ? {} : { pull: this.options.pull }),
			});
		} catch (error) {
			this.dependencies.capacity.release(name);
			if (error instanceof SandboxError && error.kind === 'already-exists') {
				throw this.createCleanup.alreadyExists(name, error);
			}
			// sbx may have created the VM before failing (a timeout says nothing): do not leave it to block the retry.
			await this.createCleanup.afterFailure(name, error);
			throw error;
		}
		this.held = { executionId, name, status: 'running', stepActive: true, generation: 0, cancelIdle: undefined };
		this.dependencies.presence.publish(this.options.wrapperId, executionId);
		this.dependencies.log.info(
			`Sandbox "${name}" created for run "${executionId}" (${this.options.cpus} cpus, ${this.options.memory}).`
		);
		return name;
	}

	private async restart(held: Held): Promise<void> {
		await this.dependencies.capacity.acquire(held.name);
		try {
			await this.dependencies.runtime.start(held.name);
		} catch (error) {
			this.dependencies.capacity.release(held.name);
			throw error;
		}
		held.status = 'running';
		this.dependencies.log.info(`Sandbox "${held.name}" restarted for the next step of run "${held.executionId}".`);
	}

	private async stopHeld(held: Held, cause: string): Promise<void> {
		try {
			await this.dependencies.runtime.stop(held.name);
		} catch (error) {
			this.dependencies.log.warn(
				`Could not stop sandbox "${held.name}" (${cause}): ${describeError(error)}. It may still run: stop it with \`sbx stop ${held.name}\`.`
			);
			throw error;
		}
		held.status = 'stopped';
		this.dependencies.capacity.release(held.name);
		this.dependencies.log.info(
			`Sandbox "${held.name}" stopped (${cause}); it is kept for run "${held.executionId}".`
		);
	}

	private armIdle(held: Held): void {
		this.clearIdle(held);
		const generation = held.generation;
		held.cancelIdle = this.dependencies.scheduler.schedule(this.options.idleStopMinutes * 60_000, () => {
			this.queue.run(() => this.stopIfIdle(held, generation)).catch(() => undefined);
		});
	}

	private clearIdle(held: Held): void {
		held.generation += 1;
		held.cancelIdle?.();
		held.cancelIdle = undefined;
	}

	private async stopIfIdle(held: Held, generation: number): Promise<void> {
		// A step started or the run ended between the timer firing and this turn of the queue: the timer is stale.
		if (this.held !== held || held.generation !== generation || held.stepActive || held.status !== 'running') {
			return;
		}
		try {
			await this.stopHeld(held, `idle for ${this.options.idleStopMinutes} min`);
		} catch {
			// stopHeld logged the failure; retry after another idle period.
			this.armIdle(held);
		}
	}

	private rememberEnded(executionId: string): void {
		this.ended.add(executionId);
		if (this.ended.size > ENDED_RUNS_REMEMBERED) {
			const oldest = this.ended.values().next();
			if (oldest.done !== true) this.ended.delete(oldest.value);
		}
	}

	private requireUsable(): void {
		if (this.closed) throw new SandboxError('invalid-argument', this.closedMessage());
		if (!this.started) {
			throw new SandboxError(
				'invalid-argument',
				'SandboxLifecycle.start() must be called before the first step.'
			);
		}
	}

	private closedMessage(): string {
		return `The sandbox lifecycle of wrapper "${this.options.wrapperId}" was shut down; create a new one.`;
	}
}
