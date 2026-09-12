import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import type { ApprovalProvider, WorkspaceHandle, WorkspaceProvider } from 'extension-points';
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
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { DefaultProjectResolver } from '../config/DefaultProjectResolver.js';
import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext, InjectedStep } from '../ipc/Protocol';
import { ExecutionStore, generateExecutionId } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { AssignmentLedger } from './AssignmentLedger.js';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

// Default limits - overridden by FlowConfig.limits passed to CommandHandler constructor
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
		// ApprovalProvider stored for future worker injection (requires IPC protocol changes)
		private readonly approvalProvider?: ApprovalProvider,
		private readonly resolvePerFlowWorkspaceProvider?: (
			section: NonNullable<FlowPluginOverrides['workspace']>
		) => Promise<WorkspaceProvider>
	) {
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

		const interventionStep = flow.steps.find((s: FlowStep) => s.type === 'user_intervention');
		if (interventionStep) {
			return {
				type: 'error',
				code: 'UNSUPPORTED_STEP_TYPE',
				message: `Step '${interventionStep.id}' is of type 'user_intervention' which is not supported in v1.`,
			};
		}

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
		).filter((s: FlowStep): s is AssignableStep => s.type === 'model' || s.type === 'script');

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
	}

	/** Drops a disconnected worker's outstanding assignments. */
	revokeWorkerAssignments(worker: WebSocket): void {
		this.assignments.revokeWorker(worker);
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

	tryDispatch(): void {
		while (this.readyQueue.length > 0) {
			const idleWorker = this.registry.getIdle();
			if (idleWorker) {
				const step = this.readyQueue.shift()!;
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
					// Worker disconnected between getIdleWorker() and send - re-queue the step
					this.registry.remove(idleWorker);
					// Transport failure: not a flow-level failure - unacknowledge and put back
					scheduler?.unacknowledge(step.stepId);
					this.readyQueue.unshift(step);
					continue;
				}
			} else if (this.provisioner.canProvision()) {
				// Obtaining a worker is asynchronous by contract (D#66), and dispatch resumes
				// when it registers -- so this is deliberately not awaited. A failure is
				// reported rather than swallowed: the queue would otherwise stall silently.
				void this.provisioner.provision().catch((err: unknown) => {
					process.stderr.write(`[CommandHandler] failed to obtain a worker: ${getErrorMessage(err)}\n`);
				});
				// continue so we request one worker per queued step (up to the limit)
				continue;
			} else {
				break;
			}
		}
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
		this.activeExecutionCount--;

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
