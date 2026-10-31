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
import { BoundStepWait, DEFAULT_BOUND_STEP_WAIT_MS, type WorkerTypeRouting } from './BoundStepWait.js';
import { DaemonSecrets } from './DaemonSecrets.js';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';
import { ExecutionHooks } from './ExecutionHooks.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import { FlowFileAccessGuard } from './FlowFileAccessGuard.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';
import { RunEndCoordinator, type RunEndSettings, type RunEndedListener } from './RunEndCoordinator.js';
import type { RunProject } from './RunProjectResolver.js';
import { RunRequestHandler } from './RunRequestHandler.js';
import { RunStepPreparer } from './RunStepPreparer.js';
import { SchedulerIdleState } from './SchedulerIdleState.js';
import { StepDispatcher } from './StepDispatcher.js';
import { DEFAULT_MAX_INJECTED_STEPS, DEFAULT_MAX_STEPS_PER_EXECUTION, StepInjection } from './StepInjection.js';
import { StepOutcomes } from './StepOutcomes.js';
import { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import { DEFAULT_STEP_SILENCE_LIMIT_MS, WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import { WorkerTypeCatalog } from './WorkerTypeCatalog.js';

export { DEFAULT_STEP_SILENCE_LIMIT_MS, MAX_REDISPATCHES } from './WorkerAssignmentSupervisor.js';

/** No source declares a worker type, and the daemon's default `worker.boundStepWaitSeconds`. */
const DEFAULT_WORKER_ROUTING: WorkerTypeRouting = {
	workerTypes: new WorkerTypeCatalog({ list: () => [] }),
	boundStepWaitMs: DEFAULT_BOUND_STEP_WAIT_MS,
};

/** Same as the daemon's defaults (`worker.runEventsEnabled`, `worker.ackTimeoutSeconds`). */
const DEFAULT_RUN_END_SETTINGS: RunEndSettings = { enabled: true, ackTimeoutMs: 30_000 };

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
	private readonly runEnd: RunEndCoordinator;
	private readonly idleState: SchedulerIdleState;
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
		requestFromDeclaredSources?: (workerTypes?: ReadonlySet<string>) => void,
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
		),
		/** Whether and how long workers that served a run are given to acknowledge its end (`worker.*` settings). */
		runEndSettings: RunEndSettings = DEFAULT_RUN_END_SETTINGS,
		/** Told, after the acknowledgements, that a run ended, so the worker type that owns the source can clean up. */
		runEndedListener?: RunEndedListener,
		/**
		 * What restricts a run to a worker type (the flow's `workerType`): the declared sources the types come from, and
		 * `worker.boundStepWaitSeconds`. Without it no type is declared, so a flow naming one is refused at run start.
		 */
		workerRouting: WorkerTypeRouting = DEFAULT_WORKER_ROUTING
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
		this.runEnd = new RunEndCoordinator(
			registry,
			this.supervisor,
			this.logWriter,
			runEndSettings,
			runEndedListener
		);
		this.idleState = new SchedulerIdleState(this.queue, this.executions, this.runEnd);
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
			(executionId, stepId, reason) => this.outcomes.failStep(executionId, stepId, reason),
			workerRouting.workerTypes,
			new BoundStepWait(workerRouting.boundStepWaitMs, Date.now, () => this.tryDispatch())
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
			},
			this.runEnd
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
			new RunDefinitionLoader(definitionResolver, this.logWriter, () => workerRouting.workerTypes.knownTypes()),
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

	/** See {@link SchedulerIdleState.isQueueEmpty}. */
	isQueueEmpty(): boolean {
		return this.idleState.isQueueEmpty();
	}

	/** See {@link SchedulerIdleState.hasActiveExecutions}. */
	hasActiveExecutions(): boolean {
		return this.idleState.hasActiveExecutions();
	}

	/** See {@link SchedulerIdleState.isExecutionActive}. */
	isExecutionActive(executionId: string): boolean {
		return this.idleState.isExecutionActive(executionId);
	}

	/** Consulted by the daemon's idle-exit check by name; see {@link SchedulerIdleState.hasResumableInterventions}. */
	hasResumableInterventions(): boolean {
		return this.idleState.hasResumableInterventions();
	}

	/** One-line snapshot for the idle-exit log entries; see {@link SchedulerIdleState.describe}. */
	describeIdleState(): string {
		return this.idleState.describe();
	}

	/** See {@link SchedulerIdleState.hasPendingRunEnds}. */
	hasPendingRunEnds(): boolean {
		return this.idleState.hasPendingRunEnds();
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
		this.runEnd.workerGone(worker);
		try {
			this.supervisor.handleWorkerDisconnect(worker);
		} finally {
			this.disconnectDetails = undefined;
		}
	}

	/** A worker answered `run_end`; see {@link RunEndCoordinator.handleAck}. */
	onRunEndAck(worker: WebSocket, executionId: string): void {
		this.runEnd.handleAck(worker, executionId);
	}

	/** Tells the workers of every run in progress that the daemon is stopping; see {@link RunEndCoordinator.announceDaemonStop}. */
	announceDaemonStop(): Promise<void> {
		return this.runEnd.announceDaemonStop();
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
		this.dispatcher.stop();
		this.runRequests.forgetRequests();
	}
}
