import type { InteractivityPolicyProvider, WorkspaceProvider } from 'extension-points';
import type { FlowDefinitionResolver } from 'flow-core';
import type { FlowPluginOverrides } from 'flow-engine';
import type { WebSocket } from 'ws';

import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import { WorkspaceProviders } from '../workspace/WorkspaceProviders';
import type { WorkspaceProviderSource } from '../workspace/WorkspaceProviders';
import { BoundStepWait, type WorkerTypeRouting } from './BoundStepWait.js';
import type { DaemonSecrets } from './DaemonSecrets.js';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';
import { ExecutionCanceller } from './ExecutionCanceller.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import { FlowFileAccessGuard } from './FlowFileAccessGuard.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';
import { RunEndCoordinator, type RunEndSettings, type RunEndedListener } from './RunEndCoordinator.js';
import { RunRequestHandler } from './RunRequestHandler.js';
import { RunStepPreparer } from './RunStepPreparer.js';
import { SchedulerIdleState } from './SchedulerIdleState.js';
import { StepDispatcher } from './StepDispatcher.js';
import { StepInjection } from './StepInjection.js';
import { StepOutcomes } from './StepOutcomes.js';
import { UnmetDemandCoverage } from './UnmetDemandCoverage.js';
import { WaitingRuns } from './WaitingRuns.js';
import { WorkerAssignmentSupervisor } from './WorkerAssignmentSupervisor.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import { WorkspaceWaitSupervisor } from './WorkspaceWaitSupervisor.js';

/** What the pipeline is built from: the state CommandHandler owns, and the settings it was given. */
export interface ExecutionPipelineDependencies {
	daemonDir: string;
	registry: WorkerRegistry;
	provisioner: WorkerProvisioner;
	executions: ExecutionRegistry;
	queue: ReadyStepQueue;
	hooks: ExecutionHooks;
	executionStore: ExecutionStore;
	logWriter: LogWriter;
	daemonSecrets: DaemonSecrets;
	workspaceProviders: WorkspaceProviderSource | undefined;
	resolvePerFlowWorkspaceProvider:
		((section: NonNullable<FlowPluginOverrides['workspace']>) => Promise<WorkspaceProvider>) | undefined;
	requestFromDeclaredSources: ((sourceIds?: ReadonlySet<string>) => void) | undefined;
	interactivityPolicy: InteractivityPolicyProvider | undefined;
	stalledStepLimitMs: number;
	definitionResolver: FlowDefinitionResolver;
	runEndSettings: RunEndSettings;
	runEndedListener: RunEndedListener | undefined;
	workerRouting: WorkerTypeRouting;
	allowAbsolutePaths: boolean;
	maxInjectedSteps: number;
	maxStepsPerExecution: number;
}

/**
 * The collaborators that run an execution once it is accepted, wired to each other: what workers hold
 * (`WorkerAssignmentSupervisor`), what a step's end means (`StepOutcomes`), handing ready steps out
 * (`StepDispatcher`), covering unmet demand, the end of a run, cancelling, injected steps and accepting a run.
 *
 * Built in one place because they reference each other (an outcome re-dispatches, a dispatch failure fails a step, a
 * cleanup forgets an execution in two of them); `CommandHandler` keeps the state they share and the public surface.
 */
export class ExecutionPipeline {
	readonly demand: UnmetDemandCoverage;
	readonly supervisor: WorkerAssignmentSupervisor;
	readonly runEnd: RunEndCoordinator;
	readonly idleState: SchedulerIdleState;
	/** The runs that wait for a workspace; they count as work in flight for the idle exit. */
	readonly waitingRuns = new WaitingRuns();
	readonly waitSupervisor: WorkspaceWaitSupervisor;
	readonly dispatcher: StepDispatcher;
	readonly outcomes: StepOutcomes;
	readonly canceller: ExecutionCanceller;
	readonly injection: StepInjection;
	readonly runRequests: RunRequestHandler;
	/** Text added to the failure of a step lost with a disconnecting worker; set only during that disconnect. */
	private disconnectDetails: ((executionId: string, stepId: string) => string | undefined) | undefined;

	constructor(deps: ExecutionPipelineDependencies) {
		const { registry, executions, queue, hooks, executionStore, logWriter, daemonSecrets, workerRouting } = deps;
		this.demand = new UnmetDemandCoverage(
			deps.provisioner,
			() => this.tryDispatch(),
			deps.requestFromDeclaredSources
		);
		this.supervisor = new WorkerAssignmentSupervisor(
			registry,
			logWriter,
			queue,
			executions,
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
			deps.stalledStepLimitMs
		);
		this.runEnd = new RunEndCoordinator(
			registry,
			this.supervisor,
			logWriter,
			deps.runEndSettings,
			deps.runEndedListener
		);
		this.idleState = new SchedulerIdleState(queue, executions, this.runEnd, this.waitingRuns);
		this.dispatcher = new StepDispatcher(
			registry,
			queue,
			executions,
			this.supervisor,
			this.demand,
			daemonSecrets,
			executionStore,
			hooks,
			logWriter,
			deps.interactivityPolicy ?? new DefaultInteractivityPolicy(),
			(executionId, stepId, reason) => this.outcomes.failStep(executionId, stepId, reason),
			{
				workerTypes: workerRouting.workerTypes,
				wait: new BoundStepWait(workerRouting.boundStepWaitMs, Date.now, () => this.tryDispatch()),
				contactErrors: workerRouting.contactErrors,
				declaredGuarantees: workerRouting.declaredGuarantees,
			}
		);
		const workspaces = new ExecutionWorkspaces(
			logWriter,
			deps.workspaceProviders ?? new WorkspaceProviders(deps.resolvePerFlowWorkspaceProvider)
		);
		this.outcomes = new StepOutcomes(
			executions,
			queue,
			executionStore,
			logWriter,
			daemonSecrets,
			workspaces,
			hooks,
			() => this.tryDispatch(),
			executionId => {
				this.supervisor.forgetExecution(executionId);
				this.dispatcher.forgetExecution(executionId);
			},
			this.runEnd
		);
		this.canceller = new ExecutionCanceller({
			executions,
			queue,
			store: executionStore,
			supervisor: this.supervisor,
			hooks,
			workspaces,
			waitingRuns: this.waitingRuns,
			logWriter,
			disconnectWorker: worker => registry.disconnect(worker),
			endExecution: (executionId, reason, priorError) =>
				this.outcomes.cleanupExecution(executionId, reason, priorError),
			tryDispatch: () => this.tryDispatch(),
		});
		this.injection = new StepInjection(
			executions,
			queue,
			daemonSecrets,
			deps.maxInjectedSteps,
			deps.maxStepsPerExecution
		);
		this.waitSupervisor = new WorkspaceWaitSupervisor(
			this.waitingRuns,
			executionStore,
			logWriter,
			(executionId, reason) => workspaces.release(executionId, reason)
		);
		this.runRequests = new RunRequestHandler(
			new FlowFileAccessGuard(deps.allowAbsolutePaths),
			new RunDefinitionLoader(deps.definitionResolver, logWriter, workerRouting.declaredGuarantees),
			new RunStepPreparer(deps.daemonDir, logWriter),
			daemonSecrets,
			workspaces,
			executions,
			queue,
			hooks,
			executionStore,
			logWriter,
			() => this.tryDispatch(),
			this.waitSupervisor,
			undefined,
			undefined,
			workerRouting.declaredGuarantees
		);
	}

	/** Hands out as many queued steps as current capacity allows; see {@link StepDispatcher.tryDispatch}. */
	tryDispatch(): void {
		this.dispatcher.tryDispatch();
	}

	/**
	 * Decides what happens to the steps a disconnected worker was holding (D#65), with `describeLostStep` adding its
	 * text to the failure of a lost step. Scoped to this synchronous call, so details never attach to an unrelated failure.
	 *
	 * Deliberately does **not** dispatch: the daemon calls `tryDispatch()` once the worker is removed.
	 */
	handleWorkerDisconnect(
		worker: WebSocket,
		describeLostStep?: (executionId: string, stepId: string) => string | undefined
	): void {
		this.disconnectDetails = describeLostStep;
		this.runEnd.workerGone(worker);
		try {
			this.supervisor.handleWorkerDisconnect(worker);
		} finally {
			this.disconnectDetails = undefined;
		}
	}
}
