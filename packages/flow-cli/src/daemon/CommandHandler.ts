import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import type {
	ApprovalProvider,
	InteractivityPolicyProvider,
	StepPlacement,
	WorkspaceHandle,
	WorkspaceProvider,
} from 'extension-points';
import { releaseWorkspace } from 'extension-points';
import { FlowValidator, WorkspaceManager } from 'flow-engine';
import { FlowScheduler } from 'flow-engine';
import type { ReadyItem, SchedulerContext, SchedulerStep } from 'flow-engine';
import { TemplateRenderer } from 'flow-engine';
import type { FlowDefinition, FlowPluginOverrides, FlowStep } from 'flow-engine';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getErrorMessage, normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { DefaultProjectResolver } from '../config/DefaultProjectResolver.js';
import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext, InjectedStep } from '../ipc/Protocol';
import { ExecutionStore, generateExecutionId } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { AssignmentLedger } from './AssignmentLedger.js';
import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';
import { assertStepLabels } from './LabelMatcher.js';
import { StepRouter } from './StepRouter.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

// Default limits - overridden by FlowConfig.limits passed to CommandHandler constructor
/**
 * How many times a step may be re-dispatched after a worker vanished before it started.
 *
 * Each re-dispatch is free by design (D#43), so without a bound a step that every worker
 * drops before starting would be requeued forever and the flow would never finish or fail.
 */
export const MAX_REDISPATCHES = 3;

/**
 * How often dispatch is retried while S8 is waiting for a declared source.
 *
 * Needed because with no live worker there is no `ready` message coming and no other event
 * to re-run dispatch: without this the wait would never end and the queue would sit still.
 */
const DEMAND_RECHECK_MS = 250;

/**
 * Confirms a step is one the daemon can hand to a worker.
 *
 * This used to be a `.filter()` keeping `model` and `script`, which meant a
 * `user_intervention` step was **dropped**: the execution ran, reported success, and simply
 * never asked the question. That was survivable only while such a flow was refused outright
 * (D#37 has since lifted that), and it is the kind of silence a filter invites -- so an
 * unexpected type now throws, and `handleRun` turns it into a refused run.
 */
function assertAssignable(step: FlowStep): AssignableStep {
	if (step.type === 'model' || step.type === 'script' || step.type === 'user_intervention') {
		return step as AssignableStep;
	}
	throw new Error(
		`Step "${step.id}" is of type "${step.type}", which the daemon cannot dispatch. Supported types: model, script, user_intervention.`
	);
}

const DEFAULT_MAX_INJECTED_STEPS = 20;
const DEFAULT_MAX_STEPS_PER_EXECUTION = 50;

interface ReadyStep {
	stepId: string;
	stepConfig: AssignableStep;
	executionContext: ExecutionContext;
}

export class CommandHandler {
	private readonly executionStore: ExecutionStore;
	private readonly logWriter: LogWriter;
	/** Per-execution FlowScheduler instances */
	private readonly schedulers = new Map<string, FlowScheduler>();
	/** Per-execution ExecutionContext */
	private readonly executionContexts = new Map<string, ExecutionContext>();
	/** Per-execution step counts (initial + injected), for MAX_INJECTED_STEPS limit */
	private readonly stepCounts = new Map<string, number>();
	/** Central queue of ready steps across all executions */
	private readonly readyQueue: ReadyStep[] = [];
	/** Work actually handed to each worker, so results can be bound to it (T-05) */
	private readonly assignments = new AssignmentLedger();
	/**
	 * What was handed to a worker, kept until the assignment settles.
	 *
	 * A disconnect has to re-dispatch the *payload*, and the assignment record only names
	 * the step -- the rendered config and context are not recoverable from it (D#62).
	 */
	private readonly dispatched = new Map<string, ReadyStep>();
	/** Re-dispatches spent per step, so a step nobody ever starts cannot loop forever (D#62) */
	private readonly redispatchCounts = new Map<string, number>();
	/**
	 * Project each execution belongs to, for routing (D#9).
	 *
	 * Absent for a run started outside any project (D#10), which is why routing treats a
	 * missing entry as "only daemon-created workers apply" rather than defaulting.
	 */
	private readonly executionProjects = new Map<string, string>();
	/** Chooses which live worker a step goes to (S3, S4) */
	private readonly router = new StepRouter();
	/** Decides the fate of a step needing a human when nothing can host one (S9) */
	private readonly interactivityPolicy: InteractivityPolicyProvider = new DefaultInteractivityPolicy();
	/** When each interactive step started waiting, so an S9 policy can bound its own wait */
	private readonly interactiveWaitSince = new Map<string, number>();
	/** When the current episode of unserved demand began, for the S8 wait (D#25) */
	private unmetDemandSince: number | undefined;
	/** Pending re-run of dispatch while S8 waits; nothing else would trigger one */
	private demandRecheck: ReturnType<typeof setTimeout> | undefined;
	/** Per-execution hook dispatchers */
	private readonly executionHooks = new Map<string, HookDispatcher>();
	/** Per-execution plugin workspace handles (only when workspaceProvider is set) */
	private readonly pluginWorkspaceHandles = new Map<
		string,
		{ handle: WorkspaceHandle; provider: WorkspaceProvider }
	>();
	/** Per-execution WorkspaceManager handles for the non-plugin path */
	private readonly nativeWorkspaceManagers = new Map<string, { manager: WorkspaceManager; workspaceId: string }>();
	private activeExecutionCount = 0;

	constructor(
		private readonly daemonDir: string,
		private readonly registry: WorkerRegistry,
		private readonly provisioner: WorkerProvisioner,
		private hookDispatcher?: HookDispatcher,
		executionStore?: ExecutionStore,
		logWriter?: LogWriter,
		private readonly allowAbsolutePaths: boolean = false,
		private readonly maxInjectedSteps: number = DEFAULT_MAX_INJECTED_STEPS,
		private readonly maxStepsPerExecution: number = DEFAULT_MAX_STEPS_PER_EXECUTION,
		private readonly workspaceProvider?: WorkspaceProvider,
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
		private readonly daemonSideApprovalProviderUnused?: ApprovalProvider,
		private readonly resolvePerFlowWorkspaceProvider?: (
			section: NonNullable<FlowPluginOverrides['workspace']>
		) => Promise<WorkspaceProvider>,
		/**
		 * Asks every declared source for a worker (D#66).
		 *
		 * Injected because contacting a source needs the daemon's own wiring -- the host
		 * registry, the published endpoint -- which this class deliberately knows nothing
		 * about. Optional so the many tests that never exercise provisioning stay unchanged.
		 */
		private readonly requestFromDeclaredSources?: () => void,
		/**
		 * S9 policy deciding the fate of a step needing a human (D#39).
		 *
		 * Injectable so a test can bound the wait instead of waiting it out, and so the
		 * extension point can be served from config without touching this class.
		 */
		interactivityPolicy?: InteractivityPolicyProvider
	) {
		if (interactivityPolicy !== undefined) this.interactivityPolicy = interactivityPolicy;
		this.executionStore = executionStore ?? new ExecutionStore(path.join(daemonDir, 'executions'));
		this.logWriter = logWriter ?? new LogWriter(path.join(daemonDir, 'logs'));
	}

	dispatchHook(
		executionId: string,
		event: Parameters<HookDispatcher['dispatch']>[0],
		payload: Record<string, unknown>
	): void {
		const dispatcher = this.executionHooks.get(executionId);
		void dispatcher?.dispatch(event, payload, err => {
			this.logWriter.writeExecution('__hook', `Hook '${event}' failed: ${String(err)}`, 'error');
		});
	}

	removeExecutionHooks(executionId: string): void {
		this.executionHooks.delete(executionId);
	}

	isQueueEmpty(): boolean {
		return this.readyQueue.length === 0;
	}

	hasActiveExecutions(): boolean {
		return this.activeExecutionCount > 0;
	}

	async handleRun(
		cmd: Extract<ClientCommand, { type: 'run' }>,
		hookDispatcher?: HookDispatcher
	): Promise<DaemonResponse> {
		const flowFile = path.isAbsolute(cmd.flowFile) ? cmd.flowFile : path.resolve(cmd.cwd, cmd.flowFile);

		if (!this.allowAbsolutePaths) {
			// violations-suppress: shared/no-out-of-repo-path homedir is deliberately an allowed root for the flow-file path restriction, so flows under the user's home are runnable
			const allowedRoots = [path.resolve(cmd.cwd), path.resolve(os.homedir())];
			let realFlowFile: string;
			try {
				realFlowFile = fs.existsSync(flowFile) ? fs.realpathSync(flowFile) : flowFile;
			} catch {
				realFlowFile = flowFile;
			}
			const isAllowed = allowedRoots.some(root => {
				let realRoot: string;
				try {
					realRoot = fs.realpathSync(root);
				} catch {
					realRoot = root;
				}
				const rel = path.relative(realRoot, realFlowFile);
				return !rel.startsWith('..') && !path.isAbsolute(rel);
			});
			if (!isAllowed) {
				return { type: 'error', code: 'FLOW_NOT_FOUND', message: 'Flow file not found.' };
			}
		}

		if (!fs.existsSync(flowFile)) {
			this.logWriter.writeExecution('__parse', `FLOW_NOT_FOUND: ${flowFile}`, 'info');
			return { type: 'error', code: 'FLOW_NOT_FOUND', message: 'Flow file not found.' };
		}

		let flow: FlowDefinition;
		try {
			const content = fs.readFileSync(flowFile, 'utf8');
			flow = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
		} catch (err) {
			this.logWriter.writeExecution('__parse', `PARSE_ERROR detail: ${String(err)}`, 'error');
			return {
				type: 'error',
				code: 'PARSE_ERROR',
				message: "Flow file has a YAML syntax error. Run 'flow validate' for details.",
			};
		}

		if (!flow || typeof flow !== 'object') {
			return { type: 'error', code: 'PARSE_ERROR', message: 'Flow file is empty or not a YAML object' };
		}

		const validator = new FlowValidator(undefined);
		const result = validator.validate(flow);
		if (!result.valid) {
			return {
				type: 'error',
				code: 'VALIDATION_FAILED',
				message: JSON.stringify(result.issues.filter((i: { severity: string }) => i.severity === 'error')),
			};
		}

		// `user_intervention` used to be refused here alongside `subflow`. It is supported now
		// (D#37): a worker with a terminal owns an approval provider and can put the question
		// to the person in front of it (D#34), and routing only ever sends such a step to a
		// worker that declared the capability (S4). `subflow` stays refused -- that is a
		// separate v1 scope line, not the same limitation.
		const subflowStep = flow.steps.find((s: FlowStep) => s.type === 'subflow');
		if (subflowStep) {
			return {
				type: 'error',
				code: 'UNSUPPORTED_STEP_TYPE',
				message: `Step '${subflowStep.id}' is of type 'subflow' which is not supported in v1.`,
			};
		}

		const flowId = cmd.flowId ?? flow.id;
		const executionId = generateExecutionId();

		let workspaceDir: string;
		let workspaceMetaDir: string;

		// Tracks the allocated plugin handle so it can be released if setup throws after allocate
		let pluginHandleEntry: { handle: WorkspaceHandle; provider: WorkspaceProvider } | undefined;

		// Resolve per-flow workspace provider override if the flow declares one
		let effectiveWorkspaceProvider: WorkspaceProvider | undefined = this.workspaceProvider;
		if (flow.plugins?.workspace && this.resolvePerFlowWorkspaceProvider) {
			try {
				effectiveWorkspaceProvider = await this.resolvePerFlowWorkspaceProvider(flow.plugins.workspace);
			} catch (err) {
				this.logWriter.writeExecution('__workspace', `PER_FLOW_WORKSPACE_ERROR: ${String(err)}`, 'error');
				return {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: `Failed to resolve per-flow workspace provider: ${String(err)}`,
				};
			}
		}

		if (effectiveWorkspaceProvider) {
			let pluginHandle: WorkspaceHandle;
			try {
				pluginHandle = await effectiveWorkspaceProvider.allocate({ taskId: executionId });
			} catch (err) {
				this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(err)}`, 'error');
				return {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: 'Failed to allocate workspace via plugin provider.',
				};
			}
			pluginHandleEntry = { handle: pluginHandle, provider: effectiveWorkspaceProvider };
			workspaceDir = pluginHandle.path;
			workspaceMetaDir = pluginHandle.path + '.meta';
			try {
				fs.mkdirSync(path.join(workspaceMetaDir, 'outputs'), { recursive: true });
				this.pluginWorkspaceHandles.set(executionId, {
					handle: pluginHandle,
					provider: effectiveWorkspaceProvider,
				});
			} catch (setupErr) {
				// Meta dir creation failed - release the handle before propagating
				void pluginHandleEntry.provider.release(pluginHandleEntry.handle).catch((releaseErr: unknown) => {
					process.stderr.write(
						`[CommandHandler] Failed to release plugin workspace after setup error for ${executionId}: ${String(releaseErr)}\n`
					);
				});
				throw setupErr;
			}
		} else {
			const workspaceManager = new WorkspaceManager(cmd.cwd);
			let workspace: Awaited<ReturnType<typeof workspaceManager.allocate>>;
			try {
				workspace = await workspaceManager.allocate({
					taskId: executionId,
					config: flow.workspace,
					existingPath: cmd.cwd,
				});
			} catch (err) {
				this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(err)}`, 'error');
				return {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: 'Failed to allocate workspace. Ensure the flow workspace directory is writable.',
				};
			}
			workspaceDir = workspace.path;
			workspaceMetaDir = workspace.metaDir;
			this.nativeWorkspaceManagers.set(executionId, { manager: workspaceManager, workspaceId: workspace.id });
		}

		const stepIds = flow.steps.map((s: FlowStep) => s.id);
		try {
			// Each run records its project so the projects with active runs can be listed
			// (D#10). Not fatal when the run comes from outside any project: the run itself
			// is still valid, it simply cannot be attributed to one.
			let projectRoot: string | undefined;
			try {
				projectRoot = new DefaultProjectResolver().resolve(cmd.cwd).projectRoot;
			} catch (err) {
				this.logWriter.writeExecution(
					executionId,
					`Run not attributed to a project: ${getErrorMessage(err)}`,
					'info'
				);
			}
			// Also kept in memory: routing consults it per dispatch, and a worker the daemon
			// did not create only serves the projects it declared (D#9).
			if (projectRoot !== undefined) this.executionProjects.set(executionId, projectRoot);
			this.executionStore.create({ executionId, flowFile, flowId, stepIds, projectRoot });
		} catch (err) {
			// Execution setup failed after workspace was allocated - release before propagating
			if (pluginHandleEntry) {
				this.pluginWorkspaceHandles.delete(executionId);
				void pluginHandleEntry.provider.release(pluginHandleEntry.handle).catch((releaseErr: unknown) => {
					process.stderr.write(
						`[CommandHandler] Failed to release workspace after setup error for ${executionId}: ${String(releaseErr)}\n`
					);
				});
			}
			throw err;
		}

		const context: ExecutionContext = {
			executionId,
			inputs: cmd.inputs ?? {},
			stepOutputs: {},
			stepMeta: {},
			workspaceDir,
			outputsDir: workspaceMetaDir + '/outputs',
			cwd: cmd.cwd,
			...(flow.workingDir ? { flowWorkingDir: flow.workingDir } : {}),
		};

		const schedulerCtx: SchedulerContext = {
			inputs: context.inputs,
			stepOutputs: new Map(),
			subStepErrors: new Map(),
		};

		// Resolve global flow env templates (context.* available: cwd, projectDir, workspaceDir)
		let resolvedGlobalEnv: Record<string, string> | undefined;
		if (flow.env) {
			const templateRenderer = new TemplateRenderer();
			const templateCtx = {
				inputs: context.inputs,
				stepOutputs: new Map<string, Record<string, unknown>>(),
				taskMetadata: {},
				context: { cwd: cmd.cwd, projectDir: cmd.cwd, workspaceDir },
			};
			resolvedGlobalEnv = Object.fromEntries(
				Object.entries(flow.env as Record<string, string>).map(([k, v]) => [
					k,
					templateRenderer.render(v, templateCtx, false),
				])
			);
		}

		// parent implicitly depends on the parent step
		const depends = new Map<string, string[]>(
			flow.steps.map((s: FlowStep) => {
				const explicit = s.depends ?? [];
				return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
			})
		);
		const assignable = (
			resolvedGlobalEnv
				? flow.steps.map((s: FlowStep) =>
						s.type === 'script'
							? {
									...s,
									env: {
										...resolvedGlobalEnv,
										...((s as { env?: Record<string, string> }).env ?? {}),
									},
								}
							: s
					)
				: flow.steps
		).map((s: FlowStep) => assertAssignable(s));

		const scheduler = new FlowScheduler(schedulerCtx);
		const readyItems = scheduler.start(assignable as unknown as SchedulerStep[], depends);

		this.schedulers.set(executionId, scheduler);
		this.executionContexts.set(executionId, context);
		this.stepCounts.set(executionId, assignable.length);
		this.activeExecutionCount++;

		if (hookDispatcher) this.executionHooks.set(executionId, hookDispatcher);

		this.enqueueReadyItems(executionId, readyItems, context);
		this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
		this.dispatchHook(executionId, 'onFlowStart', { executionId, flowId, flowFile });

		this.tryDispatch();

		return { type: 'execution_started', executionId };
	}

	/**
	 * Confirms a worker is reporting against work this daemon actually gave it (T-05).
	 *
	 * Returns false when the report cannot be bound to an outstanding assignment, having
	 * already logged why. The caller must then drop the message: accepting it would let
	 * one worker write another execution's step outputs.
	 */
	verifyAssignment(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): boolean {
		const result = this.assignments.verify(worker, assignmentId, executionId, stepId);
		if (!result.ok) {
			process.stderr.write(`[CommandHandler] rejected worker report: ${result.reason}\n`);
			return false;
		}
		return true;
	}

	/** As {@link verifyAssignment}, for messages that name no step (inject_steps). */
	verifyAssignmentScope(worker: WebSocket, assignmentId: string, executionId: string): boolean {
		const result = this.assignments.verifyScope(worker, assignmentId, executionId);
		if (!result.ok) {
			process.stderr.write(`[CommandHandler] rejected worker report: ${result.reason}\n`);
			return false;
		}
		return true;
	}

	/** Closes an assignment once its outcome has been accepted. */
	settleAssignment(assignmentId: string): void {
		this.assignments.settle(assignmentId);
		// The payload was only kept for a possible re-dispatch, which can no longer happen.
		this.dispatched.delete(assignmentId);
	}

	/**
	 * Records that a worker has begun executing an assigned step (D#65).
	 *
	 * Verified like any other result message: a worker must not be able to change how
	 * another worker's disconnect is classified (T-05).
	 */
	onStepStarted(worker: WebSocket, assignmentId: string, executionId: string, stepId: string): void {
		const verified = this.assignments.verify(worker, assignmentId, executionId, stepId);
		if (!verified.ok) {
			process.stderr.write(`[CommandHandler] rejected step_started: ${verified.reason}\n`);
			return;
		}
		this.assignments.markStarted(assignmentId);
		// The re-dispatch budget counts hand-offs that never began. This one did, so the
		// step's earlier aborted hand-offs must not still be held against it: a later retry
		// would otherwise start part-way through a budget it never spent.
		this.redispatchCounts.delete(`${executionId}:${stepId}`);
		this.logWriter.writeExecution(executionId, `Step ${stepId} started executing`, 'info');
	}

	/**
	 * Decides what happens to the steps a disconnected worker was holding (D#65).
	 *
	 * Deliberately does **not** dispatch: the caller removes the worker from the registry
	 * afterwards, so dispatching here could hand the requeued step straight back to the
	 * socket that just died. `Daemon` calls `tryDispatch()` once the removal is done.
	 */
	handleWorkerDisconnect(worker: WebSocket): void {
		for (const assignment of this.assignments.revokeWorker(worker)) {
			const { executionId, stepId, assignmentId, started } = assignment;
			const step = this.dispatched.get(assignmentId);
			this.dispatched.delete(assignmentId);

			if (started) {
				// It may already have changed something, so the author's retry/onFailure
				// decides rather than us silently replaying a half-run step.
				this.failStep(
					executionId,
					stepId,
					`the worker running this step disconnected while it was executing. It was not retried automatically because it may have already had an effect; re-run the flow, or declare "retry" on the step if it is safe to repeat.`
				);
				continue;
			}

			const key = `${executionId}:${stepId}`;
			const spent = (this.redispatchCounts.get(key) ?? 0) + 1;
			if (step === undefined) {
				// Nothing to re-send, so waiting for this step would hang the execution.
				this.failStep(
					executionId,
					stepId,
					`the worker holding this step disconnected before starting it, and the daemon no longer has the assignment to re-send. Please report this.`
				);
				continue;
			}
			if (spent > MAX_REDISPATCHES) {
				this.failStep(
					executionId,
					stepId,
					`no worker started this step: it was handed out ${String(MAX_REDISPATCHES + 1)} times and every worker disconnected first. Check that a worker stays connected ("flow worker list") and that it serves this project.`
				);
				continue;
			}

			this.redispatchCounts.set(key, spent);
			// The step was never sent as far as the flow is concerned, which is exactly
			// what unacknowledge means -- so no retry attempt is consumed (D#43).
			this.schedulers.get(executionId)?.unacknowledge(stepId);
			this.readyQueue.unshift(step);
			this.logWriter.writeExecution(
				executionId,
				`Worker disconnected before starting ${stepId}; re-queued (attempt ${String(spent)} of ${String(MAX_REDISPATCHES)})`,
				'info'
			);
		}
	}

	/** Called by Daemon when a worker reports step_completed. */
	onStepCompleted(
		executionId: string,
		stepId: string,
		output: Record<string, unknown>,
		meta?: import('flow-engine/types').StepMeta
	): void {
		const scheduler = this.schedulers.get(executionId);
		if (!scheduler) {
			process.stderr.write(
				`[CommandHandler] onStepCompleted: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup\n`
			);
			return;
		}

		// Sync output and meta to ExecutionContext (used by worker for template rendering in next step)
		const context = this.executionContexts.get(executionId)!;
		context.stepOutputs[stepId] = output;
		if (meta) context.stepMeta[stepId] = meta;

		// Parent-blocking and deferral logic is handled inside FlowScheduler.complete().
		// It returns [] while children are pending; fires deferred completion when all children settle.
		const newReady = scheduler.complete(stepId, { type: 'completed', outputs: output });

		if (scheduler.isTerminal()) {
			// Mark any steps skipped by the scheduler (still 'pending' in store) as completed
			// so the daemon's allDone check can detect execution completion.
			this.markSkippedStepsCompleted(executionId);
			this.cleanupExecution(executionId);
		} else {
			this.enqueueReadyItems(executionId, newReady, context);
			// Note: tryDispatch() is called by Daemon after onStepCompleted returns
		}
	}

	/** Called by Daemon when a worker reports step_failed. */
	onStepFailed(executionId: string, stepId: string, error: string, outputs?: Record<string, unknown>): void {
		const scheduler = this.schedulers.get(executionId);
		if (!scheduler) {
			process.stderr.write(
				`[CommandHandler] onStepFailed: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup\n`
			);
			return;
		}

		const context = this.executionContexts.get(executionId)!;

		// FlowScheduler.complete() handles child-failure propagation internally:
		// - If the failed step is a child and the parent is deferred, the parent is re-queued
		//   (with error recorded in subStepErrors) up to maxSubStepIterations times.
		// - After max iterations the parent is failed terminally, hasFailed() returns true.
		const newReady = scheduler.complete(stepId, { type: 'failed', error, outputs });

		if (scheduler.hasFailed()) {
			// Terminal failure - purge queued steps for this execution and cleanup
			for (let i = this.readyQueue.length - 1; i >= 0; i--) {
				if (this.readyQueue[i]!.executionContext.executionId === executionId) {
					this.readyQueue.splice(i, 1);
				}
			}
			this.executionStore.markExecutionFailed(executionId);
			this.cleanupExecution(executionId, new Error(error));
		} else {
			// Loop/retry/sub-step-re-run in progress - re-enqueue steps returned by the scheduler
			this.enqueueReadyItems(executionId, newReady, context);
			this.tryDispatch();
		}
	}

	/**
	 * Fails a step the daemon itself decided cannot proceed, with the same treatment a
	 * failure reported by a worker gets.
	 *
	 * The store write and the hook are not optional extras: a step left `running` in the
	 * execution store shows up in `flow history` as still running forever, and a hook that
	 * fires for a failing script but not for a lost worker is a gap the author cannot see.
	 */
	private failStep(executionId: string, stepId: string, reason: string): void {
		this.executionStore.markStepFailed(executionId, stepId, reason);
		this.logWriter.writeExecution(executionId, `Step ${stepId} failed: ${reason}`, 'error');
		this.onStepFailed(executionId, stepId, reason);
		this.dispatchHook(executionId, 'onStepFailed', { executionId, stepId, error: reason });
	}

	/** Called by Daemon for inject_steps messages. */
	injectSteps(executionId: string, injectedSteps: InjectedStep[]): void {
		const scheduler = this.schedulers.get(executionId);
		if (!scheduler) {
			throw new Error(`No active execution found for id: ${executionId}`);
		}

		// Per-call limit check applies to the full requested batch (before dedup)
		if (injectedSteps.length > this.maxInjectedSteps) {
			throw new Error(
				`provideSteps: ${injectedSteps.length} steps exceeds per-call limit of ${this.maxInjectedSteps}`
			);
		}

		const allKnownIds = new Set([...this.getKnownStepIds(executionId), ...injectedSteps.map(s => s.id)]);

		// Separate steps into those to skip (existing non-in-flight) and those to inject.
		// Idempotent: a step that already exists and is not in-flight is a no-op (loop re-run scenario).
		const stepsToInject: InjectedStep[] = [];
		for (const injected of injectedSteps) {
			if (this.isKnownStepId(executionId, injected.id)) {
				if (scheduler.isInFlight(injected.id)) {
					throw new Error(
						`Step id '${injected.id}' is currently in-flight in execution ${executionId} and cannot be re-injected`
					);
				}
				// Non-in-flight existing step: treat as no-op (idempotent re-injection after loop reset)
				continue;
			}
			if (injected.parent !== undefined && !allKnownIds.has(injected.parent)) {
				throw new Error(`Parent step '${injected.parent}' does not exist in execution ${executionId}`);
			}
			if (injected.depends) {
				for (const dep of injected.depends) {
					if (!allKnownIds.has(dep)) {
						throw new Error(`Dependency step '${dep}' does not exist in execution ${executionId}`);
					}
				}
			}
			stepsToInject.push(injected);
		}

		// Limit check uses only genuinely new steps
		const currentCount = this.stepCounts.get(executionId) ?? 0;
		const totalAfterInject = currentCount + stepsToInject.length;
		if (totalAfterInject > this.maxStepsPerExecution) {
			throw new Error(
				`Execution ${executionId} would exceed max steps per execution (${this.maxStepsPerExecution}) after injection`
			);
		}

		this.stepCounts.set(executionId, totalAfterInject);

		if (stepsToInject.length === 0) return;

		const context = this.executionContexts.get(executionId)!;
		// Pass `parent` through -- FlowScheduler.inject() registers parent-child relationships natively
		const newReady = scheduler.inject(stepsToInject as SchedulerStep[]);
		this.enqueueReadyItems(executionId, newReady, context);
	}

	/**
	 * Hands out as many queued steps as current capacity allows.
	 *
	 * Every queued step is considered, not just the head: which workers may run a step now
	 * depends on the step (labels, project, interactivity), so stopping at the first
	 * unplaceable one would let a single unsatisfiable label stall independent work behind
	 * it. Steps that find no worker keep their place in the queue.
	 */
	tryDispatch(): void {
		/** Steps nothing could run this pass, put back in order once the pass ends. */
		const unplaced: ReadyStep[] = [];

		while (this.readyQueue.length > 0) {
			const step = this.readyQueue.shift()!;

			let placement: StepPlacement;
			try {
				placement = this.placementFor(step);
			} catch (err) {
				// A step whose routing cannot even be described is never placeable, so
				// leaving it queued would stall the flow with no explanation.
				this.failStep(step.executionContext.executionId, step.stepId, normalizeError(err).message);
				continue;
			}

			const idleWorker = this.router.select(placement, this.registry.listIdle());
			if (idleWorker === undefined && placement.requiresUserInterface && this.failIfNobodyCanAnswer(step)) {
				continue;
			}
			if (idleWorker) {
				const scheduler = this.schedulers.get(step.executionContext.executionId);

				// Before dispatching, sync sub-step errors and sub-step outputs from the scheduler
				// into ExecutionContext so the worker can render ${{ context.lastSubStepError }},
				// ${{ subSteps.stepId.outputs.stderr }}, and {% if subSteps.stepId.status.failed %}
				if (scheduler) {
					const errors = scheduler.getSubStepErrors(step.stepId);
					if (errors.length > 0) {
						if (!step.executionContext.subStepErrors) {
							step.executionContext.subStepErrors = {};
						}
						step.executionContext.subStepErrors[step.stepId] = errors;
					}
					const subStepsMap = scheduler.getSubSteps();
					if (subStepsMap && subStepsMap.size > 0) {
						step.executionContext.subSteps = Object.fromEntries(subStepsMap);
					}
				}

				this.registry.markBusy(idleWorker);
				// Acknowledge: marks step as in-flight in scheduler to prevent double-dispatch
				scheduler?.acknowledge(step.stepId);
				// Provenance recorded at dispatch: this is the only moment both the source
				// and the worker identity are known (T-06).
				const worker = this.registry.describe(idleWorker);
				this.executionStore.markStepRunning(step.executionContext.executionId, step.stepId, {
					sourceId: worker?.sourceId,
					workerId: worker?.workerId,
				});
				this.dispatchHook(step.executionContext.executionId, 'onStepStart', {
					executionId: step.executionContext.executionId,
					stepId: step.stepId,
				});

				const assignment = this.assignments.issue(idleWorker, step.executionContext.executionId, step.stepId);
				// Kept so a disconnect can re-send this exact payload (D#62).
				this.dispatched.set(assignment.assignmentId, step);
				const sent = this.registry.send(idleWorker, {
					type: 'assign',
					assignmentId: assignment.assignmentId,
					stepId: step.stepId,
					stepConfig: step.stepConfig,
					executionContext: step.executionContext,
				});
				if (!sent) {
					// Never handed over, so the assignment must not stay outstanding.
					this.assignments.settle(assignment.assignmentId);
					this.dispatched.delete(assignment.assignmentId);
					// Worker disconnected between getIdleWorker() and send - re-queue the step
					this.registry.remove(idleWorker);
					// Transport failure: not a flow-level failure - unacknowledge and put back
					scheduler?.unacknowledge(step.stepId);
					this.readyQueue.unshift(step);
					continue;
				}
			} else {
				unplaced.push(step);
			}
		}

		this.readyQueue.unshift(...unplaced);
		this.coverUnmetDemand(unplaced.length);
	}

	/**
	 * Asks S9 what to do about a step needing a human that nothing can host (D#39, D#61).
	 *
	 * Kept out of the provisioning path on purpose: no amount of provisioning helps here. A
	 * forked worker has no terminal, so the daemon cannot create its way out of this, and
	 * treating it as ordinary unmet demand would leave the step queued forever.
	 *
	 * @returns true when the step was failed and must not be re-queued.
	 */
	private failIfNobodyCanAnswer(step: ReadyStep): boolean {
		const key = `${step.executionContext.executionId}:${step.stepId}`;
		const since = this.interactiveWaitSince.get(key) ?? Date.now();
		this.interactiveWaitSince.set(key, since);

		const interactiveWorkers = this.registry.summarize().filter(worker => worker.hasUserInterface).length;
		const decision = this.interactivityPolicy.decide({
			stepId: step.stepId,
			waitingMs: Date.now() - since,
			interactiveWorkers,
		});
		if (decision.action === 'wait') return false;

		this.interactiveWaitSince.delete(key);
		this.failStep(step.executionContext.executionId, step.stepId, decision.reason);
		return true;
	}

	/**
	 * Acts on steps nothing could take, per the provisioning extension point (S8).
	 *
	 * The daemon owns the clock here and hands S8 how long the demand has gone unserved, so
	 * the default can wait briefly for a declared source without anything blocking (D#25,
	 * D#66). Waiting is expressed as forking nothing yet, and the next pass asks again --
	 * either when a worker registers or when the next step becomes ready.
	 *
	 * The re-check timer matters: with no live worker there is no `ready` message coming, so
	 * nothing else would ever re-run dispatch and the wait would never end.
	 */
	private coverUnmetDemand(unmetDemand: number): void {
		if (unmetDemand === 0) {
			this.unmetDemandSince = undefined;
			this.clearDemandRecheck();
			return;
		}

		const now = Date.now();
		const isNewEpisode = this.unmetDemandSince === undefined;
		this.unmetDemandSince ??= now;

		// Ask the declared sources first, and exactly once for this episode (D#66). Before this
		// they were contacted only at daemon startup, which made the S8 wait a wait for something
		// nobody had been asked for -- and put remote capacity out of reach of any run that began
		// later. Once per episode, not once per pass: the re-check fires several times a second.
		if (isNewEpisode) this.requestFromDeclaredSources?.();

		const plan = this.provisioner.planProvisioning(unmetDemand, now - this.unmetDemandSince);

		// Checked rather than trusted: this runs from a timer as well as from a message, and an
		// exception there takes the daemon down with no stack a user could act on. Reported and
		// the re-check dropped, so the same broken answer is not repeated four times a second;
		// the queue resumes on the next real event.
		if (typeof plan?.fork !== 'number' || !Number.isFinite(plan.fork)) {
			process.stderr.write(
				`[CommandHandler] the provisioning plugin returned no usable decision (${JSON.stringify(plan)}); it must return { fork: <number> }. ${String(unmetDemand)} step(s) are waiting and no worker was requested.\n`
			);
			this.clearDemandRecheck();
			return;
		}

		if (plan.fork === 0) {
			this.scheduleDemandRecheck();
			return;
		}

		if (plan.warning !== undefined) {
			process.stderr.write(`[CommandHandler] ${plan.warning}\n`);
		}
		this.clearDemandRecheck();
		// The demand is now covered as far as this pass can tell; a new episode starts its
		// own wait rather than inheriting this one's elapsed time.
		this.unmetDemandSince = undefined;

		for (let i = 0; i < plan.fork; i++) {
			// Obtaining a worker is asynchronous by contract (D#66) and dispatch resumes when
			// it registers, so this is deliberately not awaited. A failure is reported rather
			// than swallowed: the queue would otherwise stall with no explanation.
			void this.provisioner.provision().catch((err: unknown) => {
				process.stderr.write(`[CommandHandler] failed to obtain a worker: ${getErrorMessage(err)}\n`);
			});
		}
	}

	/** Re-runs dispatch once the S8 wait can have elapsed, since nothing else would. */
	private scheduleDemandRecheck(): void {
		if (this.demandRecheck !== undefined) return;
		this.demandRecheck = setTimeout(() => {
			this.demandRecheck = undefined;
			this.tryDispatch();
		}, DEMAND_RECHECK_MS);
		// Never the reason the daemon stays up: idle shutdown is decided elsewhere (D#51).
		this.demandRecheck.unref?.();
	}

	private clearDemandRecheck(): void {
		if (this.demandRecheck === undefined) return;
		clearTimeout(this.demandRecheck);
		this.demandRecheck = undefined;
	}

	/**
	 * Drops work scheduled for later, when the daemon is shutting down.
	 *
	 * Without this the pending re-check survives the shutdown and runs against a daemon that
	 * has closed its listener, so it asks for capacity nothing can deliver and reports against
	 * torn-down collaborators. The timer is unref'd, so it never *delays* exit -- it just
	 * should not fire after the decision to stop.
	 */
	stopBackgroundWork(): void {
		this.clearDemandRecheck();
	}

	/**
	 * Describes a step for routing.
	 *
	 * @throws when the step's `labels` are not a list. Schema validation already refuses
	 *         such a flow before it starts (D#7), so this covers the path that skips it --
	 *         a step injected at runtime. Reported as a step failure by the caller, because
	 *         an unmatchable label set means no worker is ever eligible and presenting that
	 *         as "waiting for capacity" would hide the mistake forever.
	 */
	private placementFor(step: ReadyStep): StepPlacement {
		const labels = (step.stepConfig as { labels?: unknown }).labels;
		assertStepLabels(labels, step.stepId);
		return {
			stepId: step.stepId,
			labels: labels ?? [],
			// The step type is the only signal for this: there is no step-level
			// `interactive` field, by design (D#60).
			requiresUserInterface: step.stepConfig.type === 'user_intervention',
			...(this.executionProjects.get(step.executionContext.executionId) !== undefined
				? { projectRoot: this.executionProjects.get(step.executionContext.executionId)! }
				: {}),
		};
	}

	private enqueueReadyItems(executionId: string, items: ReadyItem[], context: ExecutionContext): void {
		for (const item of items) {
			this.readyQueue.push({
				stepId: item.stepId,
				stepConfig: item.step as unknown as AssignableStep,
				executionContext: context,
			});
		}
	}

	private markSkippedStepsCompleted(executionId: string): void {
		if (!this.executionStore.exists(executionId)) return;
		const state = this.executionStore.read(executionId);
		for (const [sid, stepState] of Object.entries(state.steps)) {
			if (stepState.status === 'pending') {
				this.executionStore.markStepCompleted(executionId, sid);
			}
		}
	}

	private cleanupExecution(executionId: string, priorError?: unknown): void {
		this.schedulers.delete(executionId);
		this.executionContexts.delete(executionId);
		this.stepCounts.delete(executionId);
		this.executionProjects.delete(executionId);
		this.activeExecutionCount--;
		// Per-step bookkeeping dies with the execution it was kept for. Both maps are keyed
		// by execution and step, so nothing else would ever remove these entries and a
		// long-lived daemon would accumulate one per step it has ever run.
		for (const key of this.redispatchCounts.keys()) {
			if (key.startsWith(`${executionId}:`)) this.redispatchCounts.delete(key);
		}
		for (const key of this.interactiveWaitSince.keys()) {
			if (key.startsWith(`${executionId}:`)) this.interactiveWaitSince.delete(key);
		}

		const pluginWs = this.pluginWorkspaceHandles.get(executionId);
		if (pluginWs) {
			this.pluginWorkspaceHandles.delete(executionId);
			void releaseWorkspace(pluginWs.provider, pluginWs.handle, priorError).catch((err: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release plugin workspace for ${executionId}: ${String(err)}\n`
				);
			});
		}

		const nativeWs = this.nativeWorkspaceManagers.get(executionId);
		if (nativeWs) {
			this.nativeWorkspaceManagers.delete(executionId);
			void nativeWs.manager.release(nativeWs.workspaceId, executionId).catch((err: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release workspace for ${executionId}: ${String(err)}\n`
				);
			});
		}
	}

	/** Returns all known step IDs for an execution (initial + injected so far). */
	private getKnownStepIds(executionId: string): Set<string> {
		return this.schedulers.get(executionId)?.getStepIds() ?? new Set();
	}

	private isKnownStepId(executionId: string, stepId: string): boolean {
		return this.getKnownStepIds(executionId).has(stepId);
	}
}
