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

import type { HookDispatcher } from '../hooks/HookDispatcher';
import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext, InjectedStep } from '../ipc/Protocol';
import { ExecutionStore, generateExecutionId } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import type { WorkerPool } from './WorkerPool';

// Default limits - overridden by FlowConfig.limits passed to CommandHandler constructor
const DEFAULT_MAX_INJECTED_STEPS = 20;
const DEFAULT_MAX_STEPS_PER_EXECUTION = 50;

interface ReadyStep {
	stepId: string;
	stepConfig: AssignableStep;
	executionContext: ExecutionContext;
}

interface ParentChildMeta {
	parentToChildren: Map<string, Set<string>>;
	childToParent: Map<string, string>;
}

export class CommandHandler {
	private readonly executionStore: ExecutionStore;
	private readonly logWriter: LogWriter;
	/** Per-execution FlowScheduler instances */
	private readonly schedulers = new Map<string, FlowScheduler>();
	/** Per-execution ExecutionContext */
	private readonly executionContexts = new Map<string, ExecutionContext>();
	/** Parent-child metadata for UI rendering (not scheduling logic) */
	private readonly parentChildIndex = new Map<string, ParentChildMeta>();
	/** Per-execution step counts (initial + injected), for MAX_INJECTED_STEPS limit */
	private readonly stepCounts = new Map<string, number>();
	/** Central queue of ready steps across all executions */
	private readonly readyQueue: ReadyStep[] = [];
	/** Per-execution hook dispatchers */
	private readonly executionHooks = new Map<string, HookDispatcher>();
	/** Per-execution plugin workspace handles (only when workspaceProvider is set) */
	private readonly pluginWorkspaceHandles = new Map<
		string,
		{ handle: WorkspaceHandle; provider: WorkspaceProvider }
	>();
	private activeExecutionCount = 0;

	constructor(
		private readonly daemonDir: string,
		private readonly workerPool: WorkerPool,
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
		}

		const stepIds = flow.steps.map((s: FlowStep) => s.id);
		try {
			this.executionStore.create({ executionId, flowFile, flowId, stepIds });
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
		};

		const schedulerCtx: SchedulerContext = {
			inputs: context.inputs,
			stepOutputs: new Map(),
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

		const depends = new Map<string, string[]>(flow.steps.map((s: FlowStep) => [s.id, s.depends ?? []]));
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
		this.parentChildIndex.set(executionId, { parentToChildren: new Map(), childToParent: new Map() });
		this.stepCounts.set(executionId, assignable.length);
		this.activeExecutionCount++;

		if (hookDispatcher) this.executionHooks.set(executionId, hookDispatcher);

		this.enqueueReadyItems(executionId, readyItems, context);
		this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
		this.dispatchHook(executionId, 'onFlowStart', { executionId, flowId, flowFile });

		this.tryDispatch();

		return { type: 'execution_started', executionId };
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

		const newReady = scheduler.complete(stepId, { type: 'completed', outputs: output });

		if (scheduler.isTerminal()) {
			// Mark any steps skipped by the scheduler (still 'pending' in store) as completed
			// so the daemon's allDone check can detect execution completion.
			this.markSkippedStepsCompleted(executionId);
			this.cleanupExecution(executionId);
		} else {
			this.enqueueReadyItems(executionId, newReady, context);
		}
	}

	/** Called by Daemon when a worker reports step_failed. */
	onStepFailed(executionId: string, stepId: string, error: string): void {
		const scheduler = this.schedulers.get(executionId);
		if (!scheduler) {
			process.stderr.write(
				`[CommandHandler] onStepFailed: no scheduler for execution ${executionId} (step ${stepId}) - late message after cleanup\n`
			);
			return;
		}

		const context = this.executionContexts.get(executionId)!;
		const newReady = scheduler.complete(stepId, { type: 'failed', error });

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
			// Loop/retry in progress - re-enqueue the step returned by the scheduler
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

		const currentCount = this.stepCounts.get(executionId) ?? 0;
		const totalAfterInject = currentCount + injectedSteps.length;
		if (injectedSteps.length > this.maxInjectedSteps) {
			throw new Error(
				`provideSteps: ${injectedSteps.length} steps exceeds per-call limit of ${this.maxInjectedSteps}`
			);
		}
		if (totalAfterInject > this.maxStepsPerExecution) {
			throw new Error(
				`Execution ${executionId} would exceed max steps per execution (${this.maxStepsPerExecution}) after injection`
			);
		}

		// Validate references and track parent-child metadata
		const meta = this.parentChildIndex.get(executionId)!;
		const allKnownIds = new Set([...this.getKnownStepIds(executionId), ...injectedSteps.map(s => s.id)]);

		for (const injected of injectedSteps) {
			if (this.isKnownStepId(executionId, injected.id)) {
				throw new Error(`Step id '${injected.id}' already exists in execution ${executionId}`);
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
		}

		// Track parent-child relationships
		for (const injected of injectedSteps) {
			if (injected.parent !== undefined) {
				if (!meta.parentToChildren.has(injected.parent)) {
					meta.parentToChildren.set(injected.parent, new Set());
				}
				meta.parentToChildren.get(injected.parent)!.add(injected.id);
				meta.childToParent.set(injected.id, injected.parent);
			}
		}

		this.stepCounts.set(executionId, totalAfterInject);

		const context = this.executionContexts.get(executionId)!;
		const newReady = scheduler.inject(injectedSteps as SchedulerStep[]);
		this.enqueueReadyItems(executionId, newReady, context);
	}

	tryDispatch(): void {
		while (this.readyQueue.length > 0) {
			const idleWorker = this.workerPool.getIdleWorker();
			if (idleWorker) {
				const step = this.readyQueue.shift()!;
				const scheduler = this.schedulers.get(step.executionContext.executionId);

				this.workerPool.markBusy(idleWorker);
				// Acknowledge: marks step as in-flight in scheduler to prevent double-dispatch
				scheduler?.acknowledge(step.stepId);
				this.executionStore.markStepRunning(step.executionContext.executionId, step.stepId);
				this.dispatchHook(step.executionContext.executionId, 'onStepStart', {
					executionId: step.executionContext.executionId,
					stepId: step.stepId,
				});

				const sent = this.workerPool.sendToWorker(idleWorker, {
					type: 'assign',
					stepId: step.stepId,
					stepConfig: step.stepConfig,
					executionContext: step.executionContext,
				});
				if (!sent) {
					// Worker disconnected between getIdleWorker() and send - re-queue the step
					this.workerPool.removeWorker(idleWorker);
					// Transport failure: not a flow-level failure - unacknowledge and put back
					scheduler?.unacknowledge(step.stepId);
					this.readyQueue.unshift(step);
					continue;
				}
			} else if (this.workerPool.canSpawn()) {
				this.workerPool.spawnWorker();
				break;
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
		this.parentChildIndex.delete(executionId);
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
	}

	/** Returns all known step IDs for an execution (initial + injected so far). */
	private getKnownStepIds(executionId: string): Set<string> {
		return this.schedulers.get(executionId)?.getStepIds() ?? new Set();
	}

	private isKnownStepId(executionId: string, stepId: string): boolean {
		return this.getKnownStepIds(executionId).has(stepId);
	}
}
