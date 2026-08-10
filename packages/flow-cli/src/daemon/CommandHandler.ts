import type { FlowDefinition } from 'flow-engine/src/types.js';
import { FlowValidator } from 'flow-engine/src/validation/FlowValidator.js';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { HookDispatcher } from '../hooks/HookDispatcher.js';
import type { AssignableStep, ClientCommand, DaemonResponse, ExecutionContext } from '../ipc/Protocol.js';
import { ExecutionStore, generateExecutionId } from '../storage/ExecutionStore.js';
import { LogWriter } from '../storage/LogWriter.js';
import { DeclaredWorkspaceProvider } from '../workspace/DeclaredWorkspaceProvider.js';
import type { StepQueue } from './StepQueue.js';
import type { WorkerPool } from './WorkerPool.js';

export class CommandHandler {
	private readonly executionStore: ExecutionStore;
	private readonly logWriter: LogWriter;

	constructor(
		private readonly daemonDir: string,
		private readonly stepQueue: StepQueue,
		private readonly workerPool: WorkerPool,
		private hookDispatcher?: HookDispatcher,
		executionStore?: ExecutionStore,
		logWriter?: LogWriter
	) {
		this.executionStore = executionStore ?? new ExecutionStore(path.join(daemonDir, 'executions'));
		this.logWriter = logWriter ?? new LogWriter(path.join(daemonDir, 'logs'));
	}

	setHookDispatcher(dispatcher: HookDispatcher): void {
		this.hookDispatcher = dispatcher;
	}

	dispatchHook(event: Parameters<HookDispatcher['dispatch']>[0], payload: Record<string, unknown>): void {
		void this.hookDispatcher?.dispatch(event, payload).catch(err => {
			this.logWriter.writeExecution('__hook', `Hook '${event}' failed: ${String(err)}`, 'error');
		});
	}

	async handleRun(cmd: Extract<ClientCommand, { type: 'run' }>): Promise<DaemonResponse> {
		const flowFile = path.isAbsolute(cmd.flowFile) ? cmd.flowFile : path.resolve(cmd.cwd, cmd.flowFile);

		if (!fs.existsSync(flowFile)) {
			return { type: 'error', code: 'FLOW_NOT_FOUND', message: `Flow file not found: ${flowFile}` };
		}

		let flow: FlowDefinition;
		try {
			const content = fs.readFileSync(flowFile, 'utf8');
			flow = yaml.load(content) as FlowDefinition;
		} catch (err) {
			return { type: 'error', code: 'PARSE_ERROR', message: `Failed to parse flow file: ${String(err)}` };
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
				message: JSON.stringify(result.issues.filter(i => i.severity === 'error')),
			};
		}

		// Resolve which flow to run (single-flow YAML has no flowId disambiguation needed)
		const flowId = cmd.flowId ?? flow.id;

		// Resolve workspace directory
		let workspaceDir: string;
		if (flow.workspace) {
			const workspaceProvider = new DeclaredWorkspaceProvider(flow.workspace, cmd.cwd);
			workspaceDir = await workspaceProvider.prepare();
		} else {
			workspaceDir = cmd.cwd;
		}

		const executionId = generateExecutionId();
		const stepIds = flow.steps.map(s => s.id);

		this.executionStore.create({ executionId, flowFile, flowId, stepIds });

		// Build ExecutionContext
		const context: ExecutionContext = {
			executionId,
			inputs: cmd.inputs ?? {},
			// MISSING_INPUT: D34 lists this error code but required-input validation is not implemented
			// in v1. Required input fields in the flow YAML are not checked here. Tracked for v2.
			stepOutputs: {},
			workspaceDir,
		};

		// Build dependency map
		const depends = new Map<string, string[]>(flow.steps.map(s => [s.id, s.depends ?? []]));

		// D8: user_intervention steps are not supported in v1 — fail fast
		const interventionStep = flow.steps.find(s => s.type === 'user_intervention');
		if (interventionStep) {
			return {
				type: 'error',
				code: 'UNSUPPORTED_STEP_TYPE',
				message: `Step '${interventionStep.id}' is of type 'user_intervention' which is not supported in v1. Use a model step with approval hooks instead.`,
			};
		}

		const assignable = flow.steps.filter(
			(s): s is AssignableStep => s.type === 'model' || s.type === 'script' || s.type === 'subflow'
		);

		this.stepQueue.enqueueExecution(context, assignable, depends);
		this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
		void this.hookDispatcher?.dispatch('onFlowStart', { executionId, flowId, flowFile }).catch(() => {});

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
				void this.hookDispatcher
					?.dispatch('onStepStart', {
						executionId: step.executionContext.executionId,
						stepId: step.stepId,
					})
					.catch(() => {});
				this.workerPool.sendToWorker(idleWorker, {
					type: 'assign',
					stepId: step.stepId,
					stepConfig: step.stepConfig,
					executionContext: step.executionContext,
				});
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
