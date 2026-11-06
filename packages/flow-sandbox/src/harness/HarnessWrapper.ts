import { declaredOutputNames } from 'flow-cli/src/worker/StepResultFrame';

import { describeError } from '../ErrorText';
import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLifecycle } from '../SandboxLifecycle';
import type { SandboxLog } from '../SandboxLog';
import { AssignmentRewriter } from './AssignmentRewriter';
import { type AssignmentWait, newAssignmentWait, withTimeout } from './AssignmentWait';
import { DaemonReporter } from './DaemonReporter';
import { type JsonObject, isJsonObject, isNonEmptyString } from './HarnessMessages';
import type { InnerWorkerHandle, InnerWorkerLauncher } from './InnerWorkerLauncher';
import { InsideMessageGuard } from './InsideMessageGuard';
import type { RelayRegistration } from './RelayRegistration';
import { ReturnedPaths } from './ReturnedPaths';
import type { PreparedSandbox, SandboxPreparer } from './SandboxPreparer';

/** The bridge as the wrapper uses it (HarnessBridge, or a fake). */
export interface BridgeControl {
	start(): Promise<number>;
	stop(): Promise<void>;
	readonly port: number;
	readonly hasInner: boolean;
	waitForInner(timeoutMs: number, signal?: AbortSignal): Promise<void>;
	send(message: JsonObject): void;
	closeInner(): void;
}

/** The daemon connection as the wrapper uses it (DaemonLink, or a fake). */
export interface DaemonControl {
	connect(): Promise<void>;
	send(message: JsonObject): void;
	close(): void;
}

export interface BridgeHandlers {
	onFrame(raw: string): void;
	onInnerClosed(): void;
}

export interface DaemonHandlers {
	onMessage(message: JsonObject): void;
	onClosed(code: number, reason: string): void;
}

export interface HarnessWrapperDependencies {
	registration: RelayRegistration;
	lifecycle: SandboxLifecycle;
	preparer: SandboxPreparer;
	launcher: InnerWorkerLauncher;
	log: SandboxLog;
	/** Builds the bridge; the wrapper gives it the handlers that feed the guard. */
	createBridge: (handlers: BridgeHandlers) => BridgeControl;
	createDaemon: (handlers: DaemonHandlers) => DaemonControl;
	/** The RunMounts of a run (workspace, `.meta` next to it). Throws with an actionable message when they are unusable. */
	createMounts: (workspaceDir: string, workspaceMetaDir: string) => RunMounts;
	now: () => number;
	/** Called once, when the harness is over (the daemon went away). The process should exit. */
	onFinished: () => void;
	/** How long to wait for the inner worker to connect after launching it. Default 60 s. */
	innerConnectTimeoutMs?: number;
	/** How long to wait for the inner worker's "ready" after a step's outcome. Default 10 s. */
	innerFreeTimeoutMs?: number;
}

const DEFAULT_INNER_CONNECT_TIMEOUT_MS = 60_000;
const DEFAULT_INNER_FREE_TIMEOUT_MS = 10_000;

/**
 * The relay harness. It registers with the daemon as one worker (labels incl. `sandbox`), and for each `assign`:
 * creates or restarts the run's sandbox (SandboxLifecycle), prepares it once (credentials, rules, bridge token),
 * makes sure the inner worker runs in the VM and is connected to the bridge, forwards the rewritten `assign`, relays
 * what the inner worker reports through InsideMessageGuard, and tells the daemon it is free again.
 *
 * Failures before or around the step (sandbox cannot be created, inner worker lost, assign refused) become a
 * `step_failed` carrying the reason; nothing is retried and nothing falls back to running on the host.
 *
 * Limits of the harness (no run-end events yet): one run per wrapper lifetime (a step of another run fails with
 * `worker-busy`); the sandbox is left STOPPED, never removed (`leftover list` / `leftover remove`); on a daemon
 * disconnect the run is interrupted with `daemon_stopping`, which stops and keeps the sandbox.
 */
export class HarnessWrapper {
	private readonly bridge: BridgeControl;
	private readonly daemon: DaemonControl;
	private readonly guard: InsideMessageGuard;
	private readonly reporter: DaemonReporter;
	private readonly innerConnectTimeoutMs: number;
	private readonly innerFreeTimeoutMs: number;
	private mounts: { executionId: string; mounts: RunMounts } | undefined;
	private prepared: { sandbox: string; value: PreparedSandbox } | undefined;
	private inner: InnerWorkerHandle | undefined;
	/** Resolved when the worker inside registered (its first `ready`), re-created at each launch. */
	private innerRegistered: { promise: Promise<void>; resolve: () => void } | undefined;
	private wait: AssignmentWait | undefined;
	private queue: Promise<void> = Promise.resolve();
	private finished = false;

	constructor(private readonly dependencies: HarnessWrapperDependencies) {
		this.innerConnectTimeoutMs = dependencies.innerConnectTimeoutMs ?? DEFAULT_INNER_CONNECT_TIMEOUT_MS;
		this.innerFreeTimeoutMs = dependencies.innerFreeTimeoutMs ?? DEFAULT_INNER_FREE_TIMEOUT_MS;
		this.guard = new InsideMessageGuard({
			log: dependencies.log,
			returnedPaths: () => (this.mounts === undefined ? undefined : new ReturnedPaths(this.mounts.mounts)),
		});
		this.bridge = dependencies.createBridge({
			onFrame: raw => this.handleInsideFrame(raw),
			onInnerClosed: () => this.handleInnerClosed(),
		});
		this.daemon = dependencies.createDaemon({
			onMessage: message => this.handleDaemonMessage(message),
			onClosed: (code, reason) => {
				void this.handleDaemonClosed(code, reason);
			},
		});
		this.reporter = new DaemonReporter(this.daemon, dependencies.log);
	}

	/** Starts the lifecycle and the bridge, connects to the daemon and registers (sends `ready`). */
	async start(): Promise<void> {
		this.dependencies.lifecycle.start();
		await this.bridge.start();
		await this.daemon.connect();
		this.daemon.send(this.dependencies.registration.ready());
		this.dependencies.log.info('harness registered with the daemon; waiting for a step with the "sandbox" label.');
	}

	/** Stops everything the wrapper holds. The sandbox is stopped, never removed. Idempotent. */
	async shutdown(reason: string): Promise<void> {
		if (this.finished) return;
		this.finished = true;
		const { log, lifecycle } = this.dependencies;
		log.info(`harness shutting down: ${reason}`);
		const held = lifecycle.current();
		try {
			if (held !== undefined) await lifecycle.endRun(held.executionId, 'daemon_stopping');
			await lifecycle.shutdown();
		} catch (error) {
			log.warn(`could not stop the sandbox cleanly: ${describeError(error)}`);
		}
		this.inner?.stop();
		await this.bridge.stop();
		this.daemon.close();
	}

	// ---- daemon side ----

	private handleDaemonMessage(message: JsonObject): void {
		switch (message['type']) {
			case 'assign':
				this.queue = this.queue
					.then(() => this.serveAssignment(message))
					.catch(error => {
						this.dependencies.log.warn(`assignment handling failed unexpectedly: ${describeError(error)}`);
					});
				return;
			case 'idle':
				return;
			case 'done':
				this.dependencies.log.warn(
					'the daemon sent "done" (a shutdown notice meant for daemon-forked workers); ignored, as flow worker does.'
				);
				return;
			default:
				this.dependencies.log.warn(
					`ignored an unknown daemon message of type ${JSON.stringify(message['type'])}.`
				);
		}
	}

	private async handleDaemonClosed(code: number, reason: string): Promise<void> {
		if (this.finished) return;
		this.dependencies.log.warn(
			`the connection to the flow daemon closed (code ${code}${reason === '' ? '' : `, ${reason}`}). The run, if any, is interrupted; its sandbox is stopped and kept (leftover list).`
		);
		await this.shutdown('daemon connection closed');
		this.dependencies.onFinished();
	}

	private async serveAssignment(raw: JsonObject): Promise<void> {
		const { log, lifecycle, now } = this.dependencies;
		const ids = this.identify(raw);
		if (ids === undefined) {
			log.warn(
				'refused an "assign" without assignmentId, stepId and executionContext.executionId; nothing was done.'
			);
			return;
		}
		const wait = newAssignmentWait(ids, declaredOutputNames(raw['stepConfig']));
		this.wait = wait;
		const timings = { received: now(), sandboxReady: 0, forwarded: 0, outcome: 0, free: 0 };
		try {
			const mounts = this.mountsFor(raw, ids.executionId);
			await lifecycle.runStep({ executionId: ids.executionId, mounts }, async ({ sandbox }) => {
				timings.sandboxReady = now();
				const prepared = await this.ensurePrepared(sandbox, mounts);
				await this.ensureInner(sandbox, prepared);
				const rewritten = new AssignmentRewriter({
					mounts,
					log,
					injectedEnv: stepType => prepared.envFor(stepType),
				}).rewrite(raw);
				this.guard.begin(rewritten.active);
				this.bridge.send(rewritten.message);
				timings.forwarded = now();
				await wait.terminal;
				timings.outcome = now();
				await withTimeout(wait.free, this.innerFreeTimeoutMs);
				timings.free = now();
			});
			log.info(
				`timing ${JSON.stringify({
					stepId: ids.stepId,
					toSandboxReadyMs: timings.sandboxReady - timings.received,
					toForwardedMs: timings.forwarded - timings.sandboxReady,
					stepMs: timings.outcome - timings.forwarded,
					toFreeMs: timings.free - timings.outcome,
					totalMs: timings.free - timings.received,
				})}`
			);
		} catch (error) {
			this.guard.end();
			if (!wait.reported) {
				wait.reported = true;
				this.reporter.send({
					type: 'step_failed',
					assignmentId: ids.assignmentId,
					executionId: ids.executionId,
					stepId: ids.stepId,
					error: `The sandbox worker could not run step "${ids.stepId}": ${describeError(error)}`,
				});
			}
			log.warn(`step "${ids.stepId}" failed in the harness: ${describeError(error)}`);
		} finally {
			this.wait = undefined;
			// Announced after the sandbox work is over, so the next assign never meets a busy lifecycle.
			this.reporter.send(this.dependencies.registration.ready());
		}
	}

	private identify(raw: JsonObject): AssignmentWait['ids'] | undefined {
		const context = raw['executionContext'];
		if (!isNonEmptyString(raw['assignmentId']) || !isNonEmptyString(raw['stepId']) || !isJsonObject(context)) {
			return undefined;
		}
		if (!isNonEmptyString(context['executionId'])) return undefined;
		return { assignmentId: raw['assignmentId'], stepId: raw['stepId'], executionId: context['executionId'] };
	}

	private mountsFor(raw: JsonObject, executionId: string): RunMounts {
		if (this.mounts !== undefined && this.mounts.executionId === executionId) return this.mounts.mounts;
		const context = raw['executionContext'] as JsonObject;
		const workspaceDir = context['workspaceDir'];
		if (!isNonEmptyString(workspaceDir)) {
			throw new SandboxError('invalid-argument', 'The assignment has no executionContext.workspaceDir.');
		}
		// The daemon puts a run's `.meta` next to its workspace (ExecutionWorkspaces: `<workspace>.meta`).
		const mounts = this.dependencies.createMounts(workspaceDir, `${workspaceDir}.meta`);
		// A different run keeps its own mounts; SandboxLifecycle refuses it (worker-busy) before anything is created.
		this.mounts = { executionId, mounts };
		return mounts;
	}

	private async ensurePrepared(sandbox: string, mounts: RunMounts): Promise<PreparedSandbox> {
		if (this.prepared?.sandbox === sandbox) return this.prepared.value;
		const value = await this.dependencies.preparer.prepare(sandbox, mounts, this.bridge.port);
		this.prepared = { sandbox, value };
		return value;
	}

	private async ensureInner(sandbox: string, prepared: PreparedSandbox): Promise<void> {
		if (this.inner !== undefined && this.bridge.hasInner) return;
		const { log } = this.dependencies;
		this.inner?.stop();
		const handle = this.dependencies.launcher.launch({ sandbox, env: prepared.innerEnv });
		this.inner = handle;
		void handle.exited.then(exit => {
			log.info(
				`inner worker process in "${sandbox}" ended (exit ${String(exit.exitCode)}${exit.error === undefined ? '' : `, ${exit.error}`}).`
			);
			if (this.inner === handle) this.inner = undefined;
		});
		let resolveRegistered: () => void = () => undefined;
		const registered = new Promise<void>(resolve => (resolveRegistered = resolve));
		this.innerRegistered = { promise: registered, resolve: resolveRegistered };
		const abort = new AbortController();
		try {
			await Promise.race([
				// Connected to the bridge is not enough: the shim connects first and starts the worker afterwards. The assign
				// may only go inside once the worker registered (its first `ready`), otherwise that `ready` would arrive while
				// the step is already assigned and look like a forged one.
				this.bridge
					.waitForInner(this.innerConnectTimeoutMs, abort.signal)
					.then(() => this.untilRegistered(sandbox, registered, abort.signal)),
				handle.exited.then(exit => {
					throw new SandboxError(
						'command-failed',
						`The inner worker in "${sandbox}" exited before it connected to the bridge (exit ${String(exit.exitCode)}${exit.error === undefined ? '' : `: ${exit.error}`}). Its output is in the lines above; typical causes: the image has no /opt/flow/inner-bridge.cjs (use flow-sandbox:m4 or later), or the proxy refused the token (HTTP 401).`,
						{ sandbox }
					);
				}),
			]);
		} catch (error) {
			handle.stop();
			if (this.inner === handle) this.inner = undefined;
			throw error;
		} finally {
			abort.abort();
		}
	}

	private untilRegistered(sandbox: string, registered: Promise<void>, signal: AbortSignal): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(
						new SandboxError(
							'timeout',
							`The inner worker in "${sandbox}" connected to the bridge but its worker did not register within ${this.innerConnectTimeoutMs} ms. Read the [inner ...] lines above: /opt/flow/worker.cjs may have failed to start.`,
							{ sandbox }
						)
					),
				this.innerConnectTimeoutMs
			);
			signal.addEventListener('abort', () => clearTimeout(timer));
			void registered.then(() => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	// ---- inside side ----

	private handleInsideFrame(raw: string): void {
		const decision = this.guard.handle(raw);
		const wait = this.wait;
		switch (decision.action) {
			case 'forward':
				{
					const sent = this.reporter.send(decision.message, wait?.declared);
					if (decision.terminal && wait !== undefined) {
						// The outcome could not be sent (frame too large, connection down): the daemon must still hear that the
						// step is over, and this wrapper must not wait for ever for a message that will not come.
						if (!sent) {
							this.reporter.send({
								type: 'step_failed',
								...wait.ids,
								error: `The result of step "${wait.ids.stepId}" could not be sent to the daemon (see the wrapper log for the reason).`,
							});
						}
						wait.reported = true;
						wait.resolveTerminal();
					}
				}
				return;
			case 'free':
				wait?.resolveFree();
				return;
			case 'absorb':
				this.dependencies.log.info(`bridge: ${decision.reason} (not forwarded).`);
				this.innerRegistered?.resolve();
				return;
			case 'drop':
				return;
			default: {
				const exhaustive: never = decision;
				throw new Error(`Unhandled decision ${JSON.stringify(exhaustive)}`);
			}
		}
	}

	private handleInnerClosed(): void {
		const wait = this.wait;
		if (wait === undefined || wait.reported) {
			// Idle stop, or the end of a finished step: nothing is lost. A waiter for "free" must not hang.
			wait?.resolveFree();
			return;
		}
		wait.reported = true;
		this.guard.end();
		this.reporter.send({
			type: 'step_failed',
			assignmentId: wait.ids.assignmentId,
			executionId: wait.ids.executionId,
			stepId: wait.ids.stepId,
			error: `The inner worker in the sandbox disconnected during step "${wait.ids.stepId}" before reporting an outcome (the process crashed, or the sandbox was stopped). The sandbox is kept; the inner worker output is in the wrapper log.`,
		});
		wait.resolveTerminal();
		wait.resolveFree();
	}
}
