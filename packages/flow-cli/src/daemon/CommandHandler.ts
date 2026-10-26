import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import type { ApprovalProvider, InteractivityPolicyProvider, WorkspaceProvider } from 'extension-points';
import {
	DefinitionSnapshotStore,
	FlowDefinitionResolver,
	definitionsDirOf,
	executionsDirOf,
	logsDirOf,
} from 'flow-core';
import type { FlowPluginOverrides } from 'flow-engine';
import type { StepMeta } from 'flow-engine/types';
import type { WebSocket } from 'ws';

import type { ClientCommand, DaemonResponse, InjectedStep, StepProgressDetail } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { DaemonSecrets } from './DaemonSecrets.js';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';
import { ExecutionHooks } from './ExecutionHooks.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import { FlowFileAccessGuard } from './FlowFileAccessGuard.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';
import type { RunProject } from './RunProjectResolver.js';
import { RunRequestHandler } from './RunRequestHandler.js';
import { RunStepPreparer } from './RunStepPreparer.js';
import { StepDispatcher } from './StepDispatcher.js';
import { DEFAULT_MAX_INJECTED_STEPS, DEFAULT_MAX_STEPS_PER_EXECUTION, StepInjection } from './StepInjection.js';
import { StepOutcomes } from './StepOutcomes.js';
import { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import { DEFAULT_STEP_SILENCE_LIMIT_MS, WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

export { DEFAULT_STEP_SILENCE_LIMIT_MS, MAX_REDISPATCHES } from './WorkerAssignmentSupervisor.js';

/**
 * The daemon's entry point for everything about executions and the work handed to workers.
 *
 * A facade over the collaborators that each own one part of it: accepting a run
 * (`RunRequestHandler`), dispatching ready steps (`StepDispatcher`), supervising what workers hold
 * (`WorkerAssignmentSupervisor`), what a step's end means (`StepOutcomes`) and injected steps
 * (`StepInjection`).
 */
export class CommandHandler {
	private readonly executionStore: ExecutionStore;
	private readonly logWriter: LogWriter;
	private readonly executions = new ExecutionRegistry();
	private readonly queue = new ReadyStepQueue();
	private readonly hooks: ExecutionHooks;
	private readonly demand: UnmetDemandCoverage;
	private readonly supervisor: WorkerAssignmentSupervisor;
	private readonly dispatcher: StepDispatcher;
	private readonly outcomes: StepOutcomes;
	private readonly injection: StepInjection;
	private readonly runRequests: RunRequestHandler;
	/**
	 * While draining, new runs are refused so in-flight executions can finish and a pending update
	 * can restart the daemon. Refused rather than queued: execution state lives only in this
	 * process's memory, so a queued run would be lost by the very restart the drain is waiting for.
	 * Not persisted: the restart that ends a drain also clears it.
	 */
	private draining = false;
	/** Text added to the failure of a step lost with a disconnecting worker; set only during that disconnect. */
	private disconnectDetails: ((executionId: string, stepId: string) => string | undefined) | undefined;

	constructor(
		daemonDir: string,
		registry: WorkerRegistry,
		provisioner: WorkerProvisioner,
		hookDispatcher?: HookDispatcher,
		executionStore?: ExecutionStore,
		logWriter?: LogWriter,
		allowAbsolutePaths: boolean = false,
		maxInjectedSteps: number = DEFAULT_MAX_INJECTED_STEPS,
		maxStepsPerExecution: number = DEFAULT_MAX_STEPS_PER_EXECUTION,
		workspaceProvider?: WorkspaceProvider,
		/**
		 * Accepted and unused, on purpose.
		 *
		 * It was held here for "future worker injection", which cannot happen: a provider
		 * object does not cross a process boundary, and the CLI approval plugin reads its own
		 * `process.stdin` while the daemon runs detached with `stdio: 'ignore'` -- so a
		 * daemon-side instance could never reach a human (D#34). The worker builds its own
		 * (`WorkerCommand`). The parameter stays only so the daemon's existing call site keeps
		 * its shape; nothing here may start using it.
		 */
		_daemonSideApprovalProviderUnused?: ApprovalProvider,
		resolvePerFlowWorkspaceProvider?: (
			section: NonNullable<FlowPluginOverrides['workspace']>
		) => Promise<WorkspaceProvider>,
		/**
		 * Asks every declared source for a worker (D#66).
		 *
		 * Injected because contacting a source needs the daemon's own wiring -- the relay
		 * registry, the published endpoint -- which this class deliberately knows nothing
		 * about. Optional so the many tests that never exercise provisioning stay unchanged.
		 */
		requestFromDeclaredSources?: () => void,
		/**
		 * S9 policy deciding the fate of a step needing a human (D#39).
		 *
		 * Injectable so a test can bound the wait instead of waiting it out, and so the
		 * extension point can be served from config without touching this class.
		 */
		interactivityPolicy?: InteractivityPolicyProvider,
		/**
		 * Silence after which an executing step is treated as stuck (`queue.stepSilenceLimit`).
		 *
		 * Generous by default: a model step can think for a long time without printing, and failing
		 * honest work is worse than noticing a wedged one late.
		 */
		stalledStepLimitMs: number = DEFAULT_STEP_SILENCE_LIMIT_MS,
		/**
		 * Resolves, hands out and masks the secrets the flows declare. The execution store and log
		 * writer built here share its masks; ones injected by the caller must be built with the same
		 * `ExecutionMasks` (the daemon does), or their output is not masked.
		 */
		daemonSecrets: DaemonSecrets = new DaemonSecrets(),
		/**
		 * Chooses the flow version a run follows and keeps its immutable snapshot under `<daemonDir>/definitions`.
		 * Injected so a test can use its own snapshot directory.
		 */
		definitionResolver: FlowDefinitionResolver = new FlowDefinitionResolver(
			new DefinitionSnapshotStore(definitionsDirOf(daemonDir))
		)
	) {
		this.executionStore =
			executionStore ?? new ExecutionStore(executionsDirOf(daemonDir), undefined, daemonSecrets.masks);
		this.logWriter = logWriter ?? new LogWriter(logsDirOf(daemonDir), undefined, daemonSecrets.masks);
		this.hooks = new ExecutionHooks(this.logWriter);
		this.demand = new UnmetDemandCoverage(provisioner, () => this.tryDispatch(), requestFromDeclaredSources);
		this.supervisor = new WorkerAssignmentSupervisor(
			registry,
			this.logWriter,
			this.queue,
			this.executions,
			(executionId, stepId, reason, endReason) => {
				// Only set while a disconnect is being processed (see handleWorkerDisconnect).
				const details = this.disconnectDetails?.(executionId, stepId);
				this.outcomes.failStep(
					executionId,
					stepId,
					details === undefined ? reason : `${reason} ${details}`,
					endReason
				);
			},
			stalledStepLimitMs
		);
		this.dispatcher = new StepDispatcher(
			registry,
			this.queue,
			this.executions,
			this.supervisor,
			this.demand,
			daemonSecrets,
			this.executionStore,
			this.hooks,
			this.logWriter,
			interactivityPolicy ?? new DefaultInteractivityPolicy(),
			(executionId, stepId, reason) => this.outcomes.failStep(executionId, stepId, reason)
		);
		const workspaces = new ExecutionWorkspaces(this.logWriter, workspaceProvider, resolvePerFlowWorkspaceProvider);
		this.outcomes = new StepOutcomes(
			this.executions,
			this.queue,
			this.executionStore,
			this.logWriter,
			daemonSecrets,
			workspaces,
			this.hooks,
			() => this.tryDispatch(),
			executionId => {
				this.supervisor.forgetExecution(executionId);
				this.dispatcher.forgetExecution(executionId);
			}
		);
		this.injection = new StepInjection(
			this.executions,
			this.queue,
			daemonSecrets,
			maxInjectedSteps,
			maxStepsPerExecution
		);
		this.runRequests = new RunRequestHandler(
			new FlowFileAccessGuard(allowAbsolutePaths),
			new RunDefinitionLoader(definitionResolver, this.logWriter),
			new RunStepPreparer(daemonDir, this.logWriter),
			daemonSecrets,
			workspaces,
			this.executions,
			this.queue,
			this.hooks,
			this.executionStore,
			this.logWriter,
			() => this.tryDispatch()
		);
	}

	dispatchHook(
		executionId: string,
		event: Parameters<HookDispatcher['dispatch']>[0],
		payload: Record<string, unknown>
	): void {
		this.hooks.dispatch(executionId, event, payload);
	}

	removeExecutionHooks(executionId: string): void {
		this.hooks.remove(executionId);
	}

	isQueueEmpty(): boolean {
		return this.queue.length === 0;
	}

	hasActiveExecutions(): boolean {
		return this.executions.activeExecutionCount() > 0;
	}

	/**
	 * Whether the scheduler still has work for this execution (steps queued, running, or about to
	 * be re-run by a retry, loop or sub-step restart). False once it settled -- completed, failed
	 * terminally -- or is unknown.
	 *
	 * The execution store cannot answer this: a step that failed and is about to run again still
	 * reads `failed` there until its next attempt starts, which made the daemon declare a run
	 * failed (and fire `onFlowError`) while the scheduler was in the middle of recovering it.
	 */
	isExecutionActive(executionId: string): boolean {
		return this.executions.isActive(executionId);
	}

	/**
	 * Whether any execution is waiting on `flow resume` after an unanswered-intervention
	 * timeout (see `ExecutionRegistry.markResumable`).
	 *
	 * Consulted by the daemon's own idle-exit check (`Daemon.ts`'s `isIdle()`) explicitly,
	 * by name, rather than relying only on `hasActiveExecutions()` staying true for it: a
	 * kept-alive execution not incrementing/decrementing the active count the way an
	 * ordinary running one does is an implementation detail of cleanup being
	 * skipped, not a documented contract -- a future change to that bookkeeping could silently
	 * reopen the race `flow resume` depends on not happening (idle-exit destroying the
	 * in-memory scheduler/context state before an operator can plausibly run it). Naming the
	 * actual condition here makes the dependency explicit instead of incidental.
	 */
	hasResumableInterventions(): boolean {
		return this.executions.resumableCount() > 0;
	}

	/**
	 * One-line diagnostic snapshot of everything `isIdle()` consults here, for the daemon's
	 * own idle-exit log entries (see `Daemon.ts`'s `checkShutdown()`).
	 *
	 * Added after an idle-exit race with `flow resume` was reported but could not be
	 * conclusively reproduced (the suspected condition -- `hasActiveExecutions()` not
	 * actually staying true through an unanswered-intervention timeout -- could not be
	 * confirmed or ruled out from code reading or a live repro alone). If it recurs, this
	 * line in the daemon log answers "what did isIdle() actually see" directly instead of
	 * requiring another investigation from scratch.
	 */
	describeIdleState(): string {
		return `queue=${String(this.queue.length)} activeExecutions=${String(this.executions.activeExecutionCount())} resumableInterventions=${String(this.executions.resumableCount())}`;
	}

	setDraining(draining: boolean): void {
		this.draining = draining;
	}

	isDraining(): boolean {
		return this.draining;
	}

	async handleRun(
		cmd: Extract<ClientCommand, { type: 'run' }>,
		hookDispatcher?: HookDispatcher,
		resolvedProject?: RunProject
	): Promise<DaemonResponse> {
		if (this.draining) {
			return {
				type: 'error',
				code: 'DAEMON_DRAINING',
				message:
					'The daemon is draining for a pending update and is not starting new flow runs. ' +
					'Retry once the update has been applied, or cancel the drain with: flow cli update --cancel-drain',
			};
		}
		return this.runRequests.handleRun(cmd, hookDispatcher, resolvedProject);
	}

	/** See {@link WorkerAssignmentSupervisor.verifyAssignment}. */
	verifyAssignment(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): boolean {
		return this.supervisor.verifyAssignment(worker, assignmentId, executionId, stepId);
	}

	/** As {@link verifyAssignment}, for messages that name no step (inject_steps). */
	verifyAssignmentScope(worker: WebSocket, assignmentId: string, executionId: string): boolean {
		return this.supervisor.verifyAssignmentScope(worker, assignmentId, executionId);
	}

	/** Closes an assignment once its outcome has been accepted. */
	settleAssignment(assignmentId: string): void {
		this.supervisor.settleAssignment(assignmentId);
	}

	/** Records that a worker is still saying something about an assignment it holds. */
	noteAssignmentActivity(assignmentId: string, detail?: StepProgressDetail): void {
		this.supervisor.noteAssignmentActivity(assignmentId, detail);
	}

	/** Called on a timer by `Daemon`; see {@link WorkerAssignmentSupervisor.failStalledSteps}. */
	failStalledSteps(): void {
		this.supervisor.failStalledSteps();
	}

	/** Records that a worker has begun executing an assigned step (D#65). */
	onStepStarted(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): void {
		this.supervisor.onStepStarted(worker, assignmentId, executionId, stepId);
	}

	/**
	 * Decides what happens to the steps a disconnected worker was holding (D#65).
	 *
	 * Deliberately does **not** dispatch: `Daemon` calls `tryDispatch()` once the worker is removed.
	 */
	handleWorkerDisconnect(
		worker: WebSocket,
		describeLostStep?: (executionId: string, stepId: string) => string | undefined
	): void {
		// Scoped to this synchronous call, so details never attach to an unrelated failure.
		this.disconnectDetails = describeLostStep;
		try {
			this.supervisor.handleWorkerDisconnect(worker);
		} finally {
			this.disconnectDetails = undefined;
		}
	}

	/** Called by Daemon when a worker reports step_completed. */
	onStepCompleted(executionId: string, stepId: string, rawOutput: Record<string, unknown>, rawMeta?: StepMeta): void {
		this.outcomes.onStepCompleted(executionId, stepId, rawOutput, rawMeta);
	}

	/** Called by Daemon when a worker reports step_failed. */
	onStepFailed(executionId: string, stepId: string, rawError: string, rawOutputs?: Record<string, unknown>): void {
		this.outcomes.onStepFailed(executionId, stepId, rawError, rawOutputs);
	}

	/** Resumes an execution kept alive after an unanswered `user_intervention` step; see {@link StepOutcomes.handleResume}. */
	handleResume(executionId: string): DaemonResponse {
		return this.outcomes.handleResume(executionId);
	}

	/** Called by Daemon for inject_steps messages. */
	injectSteps(executionId: string, injectedSteps: InjectedStep[]): void {
		this.injection.injectSteps(executionId, injectedSteps);
	}

	/** Hands out as many queued steps as current capacity allows; see {@link StepDispatcher.tryDispatch}. */
	tryDispatch(): void {
		this.dispatcher.tryDispatch();
	}

	/** Drops work scheduled for later, when the daemon is shutting down; see {@link UnmetDemandCoverage.stop}. */
	stopBackgroundWork(): void {
		this.demand.stop();
	}
}
