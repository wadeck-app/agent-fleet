import { WORKER_FEATURE_RUN_EVENTS } from 'flow-cli/src/ipc/Protocol';
import { declaredOutputNames } from 'flow-cli/src/worker/StepResultFrame';

import { describeError } from '../ErrorText';
import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxLifecycle } from '../SandboxLifecycle';
import type { SandboxLog } from '../SandboxLog';
import { SandboxableWorkspace } from '../SandboxableWorkspace';
import { DaemonFrameFit } from '../harness/DaemonFrameFit';
import { DaemonReporter } from '../harness/DaemonReporter';
import { type JsonObject, isJsonObject, isNonEmptyString } from '../harness/HarnessMessages';
import type { DaemonControl, DaemonHandlers } from '../harness/HarnessWrapper';
import { InsideMessageGuard } from '../harness/InsideMessageGuard';
import type { RelayRegistration } from '../harness/RelayRegistration';
import { ReturnedPaths } from '../harness/ReturnedPaths';
import { ExecAssignment, type PreparedAssignment } from './ExecAssignment';
import { ExecRunEnd } from './ExecRunEnd';
import type { ExecPreparedSandbox, ExecSandboxPreparer } from './ExecSandboxPreparer';
import { READ_ONLY_GUARANTEE, RequiresGuard } from './RequiresGuard';

/** What the engine reports for a step that ran (the shape of flow-cli's `WorkerAdapter.execute` result). */
export interface StepOutcome {
	output: JsonObject;
	meta?: JsonObject;
	io?: JsonObject;
}

/** Runs one step with the engine on the host. Messages about the step are passed to `send` (assignment-scoped, unframed). */
export interface StepExecutor {
	execute(
		stepConfig: JsonObject,
		executionContext: JsonObject,
		send: (message: JsonObject) => void
	): Promise<StepOutcome>;
}

export interface StepExecutorContext {
	sandbox: string;
	mounts: RunMounts;
	/** Environment names the step declares; any other variable that merely copies the host environment must not reach the VM. */
	declaredEnvironmentNames: ReadonlySet<string>;
	/** Stops the run's sandbox so a process in the VM dies (the lifecycle's `stopForKill`: the step stays active). */
	stopSandbox: () => Promise<void>;
	/** Restarts the sandbox before an exec if a kill stopped it (the lifecycle's `ensureRunning`). */
	ensureRunning: () => Promise<void>;
}

/** What the wrapper knows when it builds the engine of a host script (`host: true`). */
export interface HostExecutorContext {
	/** Environment names the step declares (its `env` and `secrets`): the only ones besides the baseline a host process receives. */
	declaredEnvironmentNames: ReadonlySet<string>;
}

export interface ExecWrapperDependencies {
	registration: RelayRegistration;
	lifecycle: SandboxLifecycle;
	preparer: Pick<ExecSandboxPreparer, 'prepare'>;
	/** Builds the engine for one step: a StepRunner with the sandbox launcher injected. May await (executable lookup). */
	createExecutor: (context: StepExecutorContext) => Promise<StepExecutor>;
	/**
	 * Builds the engine for a script step marked `host: true`: the same engine with the machine's own launcher (environment
	 * allow-listed), no sandbox. Such a step never touches the lifecycle, so it never creates or wakes the VM.
	 */
	createHostExecutor: (context: HostExecutorContext) => StepExecutor;
	log: SandboxLog;
	createDaemon: (handlers: DaemonHandlers) => DaemonControl;
	/**
	 * The RunMounts of a run (workspace, `.meta` next to it). `readOnlyWorkspace` is true when the run requires `fs=readonly-enforced`:
	 * the workspace must then be a `:ro` mount (the wrapper checks what comes back). Throws with an actionable message when they are unusable.
	 */
	createMounts: (workspaceDir: string, workspaceMetaDir: string, readOnlyWorkspace: boolean) => RunMounts;
	now: () => number;
	/** Called once, when the wrapper is over (the daemon went away). The process should exit. */
	onFinished: () => void;
	/** Pause before the single retry of a failed removal at the end of a run (see ExecRunEnd). Default 2 s. */
	runEndRetryDelayMs?: number;
	/**
	 * Refuse a step whose assignment has no `requires`, or one this worker does not guarantee (RequiresGuard). The sandbox plugin's
	 * wrapper sets it. Explicit, no default: only the dev harness scripts (routing by labels, no guarantees) turn it off.
	 */
	requireGuarantees: boolean;
}

/**
 * The exec variant of the sandbox worker. It registers with the daemon as one worker (labels incl. `sandbox`) and, for
 * each `assign`, runs the step with a normal flow engine ON THE HOST whose `ProcessLauncher` is the sandbox launcher: the
 * engine, the MCP server, outputs and `.meta` stay on the host, only the processes of the step run in the run's sandbox
 * (SbxProcessLauncher). Per run it creates or restarts the sandbox (SandboxLifecycle) and prepares it once
 * (credentials, network rules, tool store: ExecSandboxPreparer).
 *
 * The messages the engine produces for the daemon still pass the closed set of InsideMessageGuard (plan decision 21):
 * `inject_steps` only from a started MODEL step, rebuilt from known fields, returned paths inside the mounts. The
 * sandbox does not talk to the daemon, so the guard here protects against an engine bug and keeps both variants on one
 * rule; the real boundary of "the sandbox cannot add steps" is the MCP callback (see the invariant tests).
 *
 * A failure before or around the step (sandbox cannot be created, assignment refused) becomes a `step_failed` with the
 * reason; nothing is retried and nothing falls back to running on the host. Limits as in the relay harness: one run per
 * wrapper lifetime, the sandbox is left STOPPED (never removed) when the daemon goes away, no run-end events (plan C2).
 */
export class ExecWrapper {
	private readonly daemon: DaemonControl;
	private readonly guard: InsideMessageGuard;
	private readonly reporter: DaemonReporter;
	private readonly runEnd: ExecRunEnd;
	/** The output names the active step declares: the only ones a too-large result never loses. */
	private declared: ReadonlySet<string> = new Set();
	private mounts: { executionId: string; mounts: RunMounts } | undefined;
	private prepared: { sandbox: string; value: ExecPreparedSandbox } | undefined;
	private queue: Promise<void> = Promise.resolve();
	private finished = false;

	constructor(private readonly dependencies: ExecWrapperDependencies) {
		this.guard = new InsideMessageGuard({
			log: dependencies.log,
			returnedPaths: () => (this.mounts === undefined ? undefined : new ReturnedPaths(this.mounts.mounts)),
		});
		this.daemon = dependencies.createDaemon({
			onMessage: message => this.handleDaemonMessage(message),
			onClosed: (code, reason) => {
				void this.handleDaemonClosed(code, reason);
			},
		});
		this.reporter = new DaemonReporter(this.daemon, dependencies.log);
		this.runEnd = new ExecRunEnd({
			lifecycle: dependencies.lifecycle,
			log: dependencies.log,
			sendAck: executionId => this.reporter.send({ type: 'run_end_ack', executionId }),
			retryDelayMs: dependencies.runEndRetryDelayMs ?? 2000,
			afterRemoval: (executionId, sandbox) => this.forgetRun(executionId, sandbox),
		});
	}

	/** Starts the lifecycle, connects to the daemon and registers (sends `ready`). */
	async start(): Promise<void> {
		this.dependencies.lifecycle.start();
		await this.daemon.connect();
		this.daemon.send(this.ready());
		this.dependencies.log.info(
			'exec wrapper registered with the daemon; waiting for a step with the "sandbox" label.'
		);
	}

	/** Stops everything the wrapper holds. The sandbox is stopped, never removed. Idempotent. */
	async shutdown(reason: string): Promise<void> {
		if (this.finished) return;
		this.finished = true;
		const { log, lifecycle } = this.dependencies;
		log.info(`exec wrapper shutting down: ${reason}`);
		const held = lifecycle.current();
		try {
			if (held !== undefined) await lifecycle.endRun(held.executionId, 'daemon_stopping');
			await lifecycle.shutdown();
		} catch (error) {
			log.warn(`could not stop the sandbox cleanly: ${describeError(error)}`);
		}
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
			case 'run_end':
				// Not on the assignment queue: it must not wait for a step that may be running (see ExecRunEnd).
				if (!this.finished) {
					this.runEnd.handle(message).catch((error: unknown) => {
						this.dependencies.log.warn(`run_end handling failed unexpectedly: ${describeError(error)}`);
					});
				}
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

	/** The registration `ready`, plus the one feature only this variant has: it wants to know when a run ends. */
	private ready(): JsonObject {
		const ready = this.dependencies.registration.ready();
		const features = Array.isArray(ready['features']) ? ready['features'] : [];
		return { ...ready, features: [...features, WORKER_FEATURE_RUN_EVENTS] };
	}

	/** The sandbox of the run is gone: its prepared credentials and mounts are not needed any more. */
	private async forgetRun(executionId: string, sandbox: string | undefined): Promise<void> {
		if (this.mounts?.executionId === executionId) this.mounts = undefined;
		const prepared = this.prepared;
		if (prepared === undefined || prepared.sandbox !== sandbox) return;
		this.prepared = undefined;
		await prepared.value.detach();
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
		const timings = { received: now(), sandboxReady: 0, prepared: 0, outcome: 0 };
		let reported = false;
		try {
			// Before anything is created: a step routed here without asking for a guarantee of this worker is not run.
			const refusal = this.dependencies.requireGuarantees ? RequiresGuard.refusal(raw['requires']) : undefined;
			if (refusal !== undefined) throw new SandboxError('invalid-argument', refusal);
			const onHost = this.placement(raw, ids.stepId) === 'host';
			const wantsReadOnly = RequiresGuard.wantsReadOnly(raw['requires']);
			if (onHost && wantsReadOnly) {
				throw new SandboxError(
					'invalid-argument',
					`host: true cannot satisfy ${READ_ONLY_GUARANTEE}: a host script writes the workspace freely. Remove host: true from step "${ids.stepId}", or the read-only requirement (profile: inspect) from the flow.`
				);
			}
			const mounts = this.mountsFor(raw, ids.executionId, ids.stepId, wantsReadOnly);
			if (onHost) {
				log.info(`script step "${ids.stepId}" runs on the host (host: true), not in the sandbox.`);
				const assignment = new ExecAssignment({ mounts, log, injectedEnv: () => ({}) }).prepare(raw);
				const executor = this.dependencies.createHostExecutor({
					declaredEnvironmentNames: assignment.declaredEnvironmentNames,
				});
				reported = await this.runStep(executor, assignment);
				return;
			}
			await lifecycle.runStep({ executionId: ids.executionId, mounts }, async ({ sandbox }) => {
				timings.sandboxReady = now();
				const preparedSandbox = await this.ensurePrepared(sandbox, mounts);
				const assignment = new ExecAssignment({
					mounts,
					log,
					injectedEnv: stepType => preparedSandbox.envFor(stepType),
				}).prepare(raw);
				const executor = await this.dependencies.createExecutor({
					sandbox,
					mounts,
					declaredEnvironmentNames: assignment.declaredEnvironmentNames,
					stopSandbox: () => lifecycle.stopForKill(ids.executionId),
					ensureRunning: () => lifecycle.ensureRunning(ids.executionId),
				});
				timings.prepared = now();
				reported = await this.runStep(executor, assignment);
				timings.outcome = now();
			});
			log.info(
				`timing ${JSON.stringify({
					stepId: ids.stepId,
					toSandboxReadyMs: timings.sandboxReady - timings.received,
					prepareMs: timings.prepared - timings.sandboxReady,
					stepMs: timings.outcome - timings.prepared,
					totalMs: timings.outcome - timings.received,
				})}`
			);
		} catch (error) {
			this.guard.end();
			if (!reported) {
				this.reporter.send({
					type: 'step_failed',
					assignmentId: ids.assignmentId,
					executionId: ids.executionId,
					stepId: ids.stepId,
					error: `The sandbox worker could not run step "${ids.stepId}": ${describeError(error)}`,
				});
			}
			log.warn(`step "${ids.stepId}" failed in the exec wrapper: ${describeError(error)}`);
		} finally {
			// Announced after the sandbox work is over, so the next assign never meets a busy lifecycle.
			this.reporter.send(this.ready());
		}
	}

	/** Runs the step and reports its outcome to the daemon. Returns true once an outcome was sent. */
	private async runStep(executor: StepExecutor, assignment: PreparedAssignment): Promise<boolean> {
		const { assignmentId, executionId, stepId } = assignment;
		this.guard.begin({ assignmentId, executionId, stepId, stepType: assignment.stepType });
		const header = { assignmentId, executionId, stepId };
		this.declared = declaredOutputNames(assignment.stepConfig);
		// Announced before the first side effect: after this the daemon treats a disconnect as a failure, not a replay.
		this.relay({ type: 'step_started', ...header });
		let outcome: JsonObject;
		try {
			const result = await executor.execute(assignment.stepConfig, assignment.executionContext, scoped =>
				this.relay({ ...scoped, assignmentId })
			);
			outcome = {
				type: 'step_completed',
				...header,
				output: result.output,
				...(result.meta === undefined ? {} : { meta: this.hostMeta(result.meta) }),
				...(result.io === undefined ? {} : { io: result.io }),
			};
		} catch (error) {
			outcome = this.failure(header, error);
		}
		if (this.relay(outcome) !== 'terminal') {
			// The guard dropped the outcome (too big, malformed): the daemon must still hear that the step is over.
			this.reporter.send({
				type: 'step_failed',
				...header,
				error: `The result of step "${stepId}" was refused by the exec wrapper (see the wrapper log for the reason).`,
			});
		}
		this.guard.end();
		return true;
	}

	/**
	 * Same fields as flow-cli's Worker.ts for a failed step (`stepOutputs`, `stdout`, `stderr`, `io`, `meta` carried by the
	 * error), so the daemon records the same failure it would record for a local worker.
	 */
	private failure(header: JsonObject, error: unknown): JsonObject {
		const carried = (typeof error === 'object' && error !== null ? error : {}) as {
			stepOutputs?: JsonObject;
			stdout?: string;
			stderr?: string;
			io?: JsonObject;
			meta?: JsonObject;
		};
		return {
			type: 'step_failed',
			...header,
			error: describeError(error),
			...(carried.stepOutputs === undefined ? {} : { output: carried.stepOutputs }),
			...(carried.stdout === undefined ? {} : { stdout: carried.stdout }),
			...(carried.stderr === undefined ? {} : { stderr: carried.stderr }),
			...(carried.io === undefined ? {} : { io: carried.io }),
			...(carried.meta === undefined ? {} : { meta: this.hostMeta(carried.meta) }),
		};
	}

	/**
	 * The engine read the paths of the session from what the CLI printed: sandbox paths (`/c/Users/...`), in places joined
	 * with the HOST separator (`\c\Users\...`). Normalised to the sandbox form so the guard translates them back to host
	 * paths and checks they stay inside the mounts.
	 */
	private hostMeta(meta: JsonObject): JsonObject {
		const normalised: JsonObject = { ...meta };
		const fix = (value: unknown): unknown =>
			typeof value === 'string' && value.startsWith('\\') && !value.startsWith('\\\\')
				? value.replaceAll('\\', '/')
				: value;
		if (normalised['session_file'] !== undefined) normalised['session_file'] = fix(normalised['session_file']);
		if (Array.isArray(normalised['files_written']))
			normalised['files_written'] = normalised['files_written'].map(fix);
		return normalised;
	}

	/** Sends one engine message through the guard. Returns what happened to it. */
	private relay(message: JsonObject): 'sent' | 'terminal' | 'dropped' {
		// Fitted before the guard (it refuses a raw frame over the limit) and again by the reporter after the guard
		// translated the paths (a host path is longer than a sandbox one).
		let fitted: JsonObject;
		try {
			fitted = DaemonFrameFit.fit(message, this.declared);
		} catch (error) {
			this.dependencies.log.warn(`could not fit a "${String(message['type'])}" message: ${describeError(error)}`);
			return 'dropped';
		}
		const decision = this.guard.handle(JSON.stringify(fitted));
		if (decision.action !== 'forward') return 'dropped';
		if (!this.reporter.send(decision.message, this.declared)) return 'dropped';
		return decision.terminal ? 'terminal' : 'sent';
	}

	private identify(raw: JsonObject): { assignmentId: string; executionId: string; stepId: string } | undefined {
		const context = raw['executionContext'];
		if (!isNonEmptyString(raw['assignmentId']) || !isNonEmptyString(raw['stepId']) || !isJsonObject(context)) {
			return undefined;
		}
		if (!isNonEmptyString(context['executionId'])) return undefined;
		return { assignmentId: raw['assignmentId'], stepId: raw['stepId'], executionId: context['executionId'] };
	}

	/**
	 * Where the step runs. The daemon sends `host: true` on the message ONLY for a script step marked `host: true`, and keeps the
	 * whole step, so a flow that spells the default out (`host: false`) arrives with the marker in the step alone: that is the VM.
	 * Anything else than "both say true on a script step" is refused with the reason: a malformed marker must not silently put a
	 * step in the VM when the message asks for the host, nor on the host.
	 */
	private placement(raw: JsonObject, stepId: string): 'host' | 'sandbox' {
		const stepConfig = isJsonObject(raw['stepConfig']) ? raw['stepConfig'] : {};
		const top = raw['host'];
		const inStep = stepConfig['host'];
		if (top !== undefined && top !== true) {
			throw new SandboxError(
				'invalid-argument',
				`"host" must be true or absent on the assign message (found ${JSON.stringify(top)}); the step is not run.`
			);
		}
		if (inStep !== undefined && typeof inStep !== 'boolean') {
			throw new SandboxError(
				'invalid-argument',
				`"host" must be true or absent in the step (found ${JSON.stringify(inStep)}); the step is not run.`
			);
		}
		if (top === undefined && inStep !== true) return 'sandbox';
		if (top !== inStep) {
			throw new SandboxError(
				'invalid-argument',
				`the "host" marker of the assign message (${JSON.stringify(top)}) and of the step (${JSON.stringify(inStep)}) disagree; the step is not run. This is a flow daemon / plugin version mismatch.`
			);
		}
		if (stepConfig['type'] !== 'script') {
			throw new SandboxError(
				'invalid-argument',
				`host: true is only for script steps, step "${stepId}" is of type ${JSON.stringify(stepConfig['type'])}. A model step always runs in the sandbox; remove host: true from it.`
			);
		}
		return 'host';
	}

	private mountsFor(raw: JsonObject, executionId: string, stepId: string, wantsReadOnly: boolean): RunMounts {
		if (this.mounts !== undefined && this.mounts.executionId === executionId) {
			this.requireSameMode(this.mounts.mounts, stepId, wantsReadOnly);
			return this.mounts.mounts;
		}
		const context = raw['executionContext'] as JsonObject;
		const workspaceDir = context['workspaceDir'];
		if (!isNonEmptyString(workspaceDir)) {
			throw new SandboxError('invalid-argument', 'The assignment has no executionContext.workspaceDir.');
		}
		// Where the run's `.meta` lives depends on the workspace provider: derived from outputsDir (<meta>/outputs).
		const mounts = this.dependencies.createMounts(
			workspaceDir,
			SandboxableWorkspace.metaDirectoryFor({
				workspaceDir,
				outputsDir: context['outputsDir'],
				workspaceReadOnly: context['workspaceReadOnly'],
			}),
			wantsReadOnly
		);
		// What the factory built must be what the run asked for: never a read/write workspace under fs=readonly-enforced.
		if (mounts.readOnlyWorkspace !== wantsReadOnly) {
			throw new SandboxError(
				'invalid-argument',
				wantsReadOnly
					? `step "${stepId}" requires ${READ_ONLY_GUARANTEE} but the mounts built for the run's workspace are not read-only; no sandbox was created.`
					: `step "${stepId}" does not require ${READ_ONLY_GUARANTEE} but the mounts built for the run's workspace are read-only; no sandbox was created.`
			);
		}
		// A different run keeps its own mounts; SandboxLifecycle refuses it (worker-busy) before anything is created.
		this.mounts = { executionId, mounts };
		return mounts;
	}

	/** The mounts of a run are fixed when its sandbox is created: every step of the run must agree on the read-only requirement. */
	private requireSameMode(mounts: RunMounts, stepId: string, wantsReadOnly: boolean): void {
		if (mounts.readOnlyWorkspace === wantsReadOnly) return;
		throw new SandboxError(
			'invalid-argument',
			wantsReadOnly
				? `step "${stepId}" requires ${READ_ONLY_GUARANTEE} but the sandbox of this run was created with a read/write workspace (the mounts are fixed when the sandbox is created). Put ${READ_ONLY_GUARANTEE} at flow level (or use profile: inspect) so every step of the run has it.`
				: `step "${stepId}" does not require ${READ_ONLY_GUARANTEE} but the sandbox of this run was created with a read-only workspace (the mounts are fixed when the sandbox is created). Give every step the same requirements at flow level.`
		);
	}

	private async ensurePrepared(sandbox: string, mounts: RunMounts): Promise<ExecPreparedSandbox> {
		if (this.prepared?.sandbox === sandbox) return this.prepared.value;
		const value = await this.dependencies.preparer.prepare(sandbox, mounts);
		this.prepared = { sandbox, value };
		return value;
	}
}
