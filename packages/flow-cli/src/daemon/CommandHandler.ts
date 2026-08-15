import { FlowValidator, WorkspaceManager } from 'flow-engine';
import type { FlowDefinition, FlowStep } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { HookDispatcher } from '../hooks/HookDispatcher';
import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext } from '../ipc/Protocol';
import { ExecutionStore, generateExecutionId } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import type { StepQueue } from './StepQueue';
import type { WorkerPool } from './WorkerPool';

export class CommandHandler {
	private readonly executionStore: ExecutionStore;
	private readonly logWriter: LogWriter;
	// Per-execution hook dispatchers — prevents concurrent run commands from overwriting each other's hooks.
	private readonly executionHooks = new Map<string, HookDispatcher>();

	constructor(
		private readonly daemonDir: string,
		private readonly stepQueue: StepQueue,
		private readonly workerPool: WorkerPool,
		private hookDispatcher?: HookDispatcher,
		executionStore?: ExecutionStore,
		logWriter?: LogWriter,
		private readonly allowAbsolutePaths: boolean = false
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

	async handleRun(
		cmd: Extract<ClientCommand, { type: 'run' }>,
		hookDispatcher?: HookDispatcher
	): Promise<DaemonResponse> {
		const flowFile = path.isAbsolute(cmd.flowFile) ? cmd.flowFile : path.resolve(cmd.cwd, cmd.flowFile);

		// Path restriction: flow file must be within the project directory or home directory.
		// Prevents the daemon from being used to read arbitrary filesystem paths.
		// Override with security.allowAbsolutePaths: true in FlowConfig.
		if (!this.allowAbsolutePaths) {
			const allowedRoots = [path.resolve(cmd.cwd), path.resolve(os.homedir())];
			// Resolve symlinks before checking containment — prevents symlink escape attacks.
			// Mirror of SecretProvider.ts:59-71.
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
				// Same message as FLOW_NOT_FOUND — do not confirm whether the file exists outside allowed dirs.
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
		// PARSE_ERROR / UNSUPPORTED_STEP_TYPE: These error codes are not listed in D34's known
		// error code table. They are daemon-side extensions. UNSUPPORTED_STEP_TYPE cross-references D8.

		const validator = new FlowValidator(undefined);
		const result = validator.validate(flow);
		if (!result.valid) {
			return {
				type: 'error',
				code: 'VALIDATION_FAILED',
				message: JSON.stringify(result.issues.filter((i: { severity: string }) => i.severity === 'error')),
			};
		}

		// D8: user_intervention steps are not supported in v1 — fail fast
		const interventionStep = flow.steps.find((s: FlowStep) => s.type === 'user_intervention');
		if (interventionStep) {
			return {
				type: 'error',
				code: 'UNSUPPORTED_STEP_TYPE',
				message: `Step '${interventionStep.id}' is of type 'user_intervention' which is not supported in v1.`,
			};
		}

		// subflow steps fail silently in WorkerAdapter — reject upfront
		const subflowStep = flow.steps.find((s: FlowStep) => s.type === 'subflow');
		if (subflowStep) {
			return {
				type: 'error',
				code: 'UNSUPPORTED_STEP_TYPE',
				message: `Step '${subflowStep.id}' is of type 'subflow' which is not supported in v1.`,
			};
		}

		// Resolve which flow to run (single-flow YAML has no flowId disambiguation needed)
		const flowId = cmd.flowId ?? flow.id;

		// Resolve workspace directory
		// H3: generate ONE executionId before allocate so taskId and executionId match
		const executionId = generateExecutionId();
		const workspaceManager = new WorkspaceManager(cmd.cwd);
		let workspace: { path: string };
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
		const workspaceDir = workspace.path;

		const stepIds = flow.steps.map((s: FlowStep) => s.id);

		this.executionStore.create({ executionId, flowFile, flowId, stepIds });

		// Build ExecutionContext
		const context: ExecutionContext = {
			executionId,
			inputs: cmd.inputs ?? {},
			// MISSING_INPUT: D34 lists this error code but required-input validation is not implemented
			// in v1. Required input fields in the flow YAML are not checked here. Tracked for v2.
			stepOutputs: {},
			workspaceDir,
			cwd: cmd.cwd,
		};

		// Build dependency map
		const depends = new Map<string, string[]>(flow.steps.map((s: FlowStep) => [s.id, s.depends ?? []]));

		const assignable = flow.steps.filter(
			(s: FlowStep): s is AssignableStep => s.type === 'model' || s.type === 'script'
			// subflow removed: already rejected above by the unsupported check
		);

		// Register the per-execution hook dispatcher so concurrent runs don't share a single mutable field.
		if (hookDispatcher) this.executionHooks.set(executionId, hookDispatcher);

		this.stepQueue.enqueueExecution(context, assignable, depends);
		this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
		this.dispatchHook(executionId, 'onFlowStart', { executionId, flowId, flowFile });

		// Try to dispatch immediately
		this.tryDispatch();

		return { type: 'execution_started', executionId };
	}

	tryDispatch(): void {
		while (!this.stepQueue.isEmpty()) {
			const idleWorker = this.workerPool.getIdleWorker();
			if (idleWorker) {
				const step = this.stepQueue.dequeue();
				if (!step) break;
				this.workerPool.markBusy(idleWorker);
				this.stepQueue.markStepActive(step.executionContext.executionId, step.stepId);
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
					// Worker disconnected between getIdleWorker() and send — re-queue the step
					this.workerPool.removeWorker(idleWorker);
					this.stepQueue.reQueueStep(step);
					continue;
				}
			} else if (this.workerPool.canSpawn()) {
				// No idle worker but below concurrency limit — spawn one
				// The spawned worker will connect, send ready, then get assigned
				this.workerPool.spawnWorker();
				break; // break: worker will connect asynchronously and we'll dispatch then
			} else {
				break; // at capacity, wait for a worker to become idle
			}
		}
	}
}
