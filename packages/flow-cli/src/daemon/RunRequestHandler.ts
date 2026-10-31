import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { generateExecutionId } from 'flow-core';
import { FlowScheduler } from 'flow-engine';
import type { SchedulerContext, SchedulerStep } from 'flow-engine';
import type { FlowStep } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { ClientCommand, DaemonResponse, ExecutionContext } from '../ipc/Protocol';
import type { ExecutionSecrets } from '../secrets/ExecutionSecrets';
import { SecretsResolutionFailedError } from '../secrets/SecretErrors';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import type { FlowFileAccessGuard } from './FlowFileAccessGuard.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import type { RunDefinitionLoader } from './RunDefinitionLoader.js';
import { RunIdempotencyCache } from './RunIdempotencyCache';
import { describeConditionError } from './SchedulerConditionError.js';
import { RunProjectResolver } from './RunProjectResolver.js';
import type { RunProject } from './RunProjectResolver.js';
import type { RunStepPreparer } from './RunStepPreparer.js';

/** Accepts a `run` request: validates it, allocates what the execution needs, records it and starts its scheduler. */
export class RunRequestHandler {
	/**
	 * @param tryDispatch Runs a dispatch pass once the execution's first steps are queued.
	 */
	constructor(
		private readonly accessGuard: FlowFileAccessGuard,
		private readonly definitionLoader: RunDefinitionLoader,
		private readonly stepPreparer: RunStepPreparer,
		private readonly daemonSecrets: DaemonSecrets,
		private readonly workspaces: ExecutionWorkspaces,
		private readonly executions: ExecutionRegistry,
		private readonly queue: ReadyStepQueue,
		private readonly hooks: ExecutionHooks,
		private readonly executionStore: ExecutionStore,
		private readonly logWriter: LogWriter,
		private readonly tryDispatch: () => void,
		private readonly projectResolver: RunProjectResolver = new RunProjectResolver(),
		private readonly idempotency: RunIdempotencyCache<DaemonResponse> = new RunIdempotencyCache<DaemonResponse>()
	) {}

	/** Forgets the remembered request ids (the daemon is stopping). */
	forgetRequests(): void {
		this.idempotency.clear();
	}

	/**
	 * Idempotent per `cmd.requestId`: a repeated id gets the response of the first request (in flight or finished), so a
	 * client retry never starts a second execution. A run without an id is not deduplicated.
	 *
	 * @param resolvedProject The project when the caller already resolved it (the daemon command does, to read the project's
	 *        hooks first); absent, it is resolved here from what the client sent.
	 */
	handleRun(
		cmd: Extract<ClientCommand, { type: 'run' }>,
		hookDispatcher?: HookDispatcher,
		resolvedProject?: RunProject
	): Promise<DaemonResponse> {
		if (cmd.requestId === undefined) {
			return this.startRun(cmd, hookDispatcher, resolvedProject);
		}
		return this.idempotency.run(cmd.requestId, () => this.startRun(cmd, hookDispatcher, resolvedProject));
	}

	private async startRun(
		cmd: Extract<ClientCommand, { type: 'run' }>,
		hookDispatcher?: HookDispatcher,
		resolvedProject?: RunProject
	): Promise<DaemonResponse> {
		// Resolved before anything is read or allocated, so a refusal leaves nothing behind. Every run belongs to a registered
		// project; the working directory is the client's cwd, or the project folder when the client named the project from elsewhere.
		const project = resolvedProject ? { ok: true as const, ...resolvedProject } : this.resolveProject(cmd);
		if (!project.ok) {
			return project.response;
		}
		const { runCwd } = project;
		const flowFile = this.accessGuard.resolve(cmd.flowFile, runCwd);
		if (!this.accessGuard.isAllowed(flowFile, runCwd)) {
			return { type: 'error', code: 'FLOW_NOT_FOUND', message: 'Flow file not found.' };
		}

		// A registered id is resolved (latest or pinned version) and a flow file is parsed as it is; either way the
		// result is validated and nothing is written yet (the snapshot is committed once the run is accepted, below).
		const loaded = this.definitionLoader.load(cmd, flowFile);
		if (!loaded.ok) {
			return loaded.response;
		}
		const resolved = loaded.resolved;
		const flow = resolved.flow;

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

		const unmockable = this.stepPreparer.refuseUnmockableTargets(flow, cmd.mockEnv);
		if (unmockable) {
			return unmockable;
		}

		const projectRoot = project.projectPath;
		const projectId = project.project.id;

		// Declared secrets are resolved before an execution id, a workspace or a record exists:
		// a secret that cannot be resolved must leave nothing behind and start no step.
		let secrets: ExecutionSecrets;
		try {
			secrets = this.daemonSecrets.prepare(flow, cmd.inputs ?? {}, runCwd);
		} catch (err) {
			if (!(err instanceof SecretsResolutionFailedError)) {
				throw err;
			}
			// Messages name the input and the reference, never a value.
			this.logWriter.writeExecution(
				'__secrets',
				`SECRET_RESOLUTION_FAILED: ${normalizeError(err).message}`,
				'error'
			);
			return { type: 'error', code: 'SECRET_RESOLUTION_FAILED', message: normalizeError(err).message };
		}

		const flowId = resolved.flowId;
		const executionId = generateExecutionId();
		// From here on every line written for this execution is masked.
		this.daemonSecrets.activate(executionId, flow, secrets, runCwd);

		const allocated = await this.workspaces.allocate(runCwd, flow, executionId);
		if (!allocated.ok) {
			return allocated.response;
		}
		const { workspaceDir, workspaceMetaDir, pluginMetaDir } = allocated;

		const stepIds = flow.steps.map((s: FlowStep) => s.id);
		const stepWaves = Object.fromEntries(
			flow.steps.filter((s: FlowStep) => s.wave !== undefined).map((s: FlowStep) => [s.id, s.wave as number])
		);
		try {
			// Each run records its project (resolved above) so the projects with active runs
			// can be listed (D#10).
			// Also kept in memory: routing consults it per dispatch, and a worker the daemon
			// did not create only serves the projects it declared (D#9).
			this.executions.setProject(executionId, { projectId, projectRoot });
			// A run bound to a worker type keeps every step on workers of that type, injected ones included; held in
			// memory next to the project because routing consults it per placement (the validator already checked the name).
			if (flow.workerType !== undefined) {
				this.executions.bindWorkerType(executionId, flow.workerType);
			}
			// The definition is frozen only now that the run is accepted: a refused run must not claim its version.
			resolved.commit();
			for (const warning of resolved.warnings) {
				this.logWriter.writeExecution(executionId, warning, 'warning');
			}
			this.executionStore.create({
				executionId,
				flowFile,
				flowId,
				stepIds,
				stepWaves,
				projectId,
				projectRoot,
				pluginMetaDir,
				definition: {
					flowVersion: resolved.version,
					definitionHash: resolved.hash,
					definitionSnapshot: resolved.definitionSnapshot,
					versionChoice: resolved.choice,
				},
			});
		} catch (err) {
			// Execution setup failed after workspace was allocated - release before propagating
			this.workspaces.releaseAfterSetupFailure(executionId);
			throw err;
		}

		const context: ExecutionContext = {
			executionId,
			// Secret inputs (references) never travel with the ordinary inputs of every step.
			inputs: secrets.publicInputs(cmd.inputs ?? {}),
			stepOutputs: {},
			stepMeta: {},
			workspaceDir,
			outputsDir: workspaceMetaDir + '/outputs',
			cwd: runCwd,
			...(flow.workingDir ? { flowWorkingDir: flow.workingDir } : {}),
			flowId: flow.id,
			flowVersion: flow.version,
		};

		const schedulerCtx: SchedulerContext = {
			inputs: context.inputs,
			stepOutputs: new Map(),
			subStepErrors: new Map(),
		};

		const depends = this.stepPreparer.dependencies(flow);
		const assignable = this.stepPreparer.prepareSteps(flow, cmd, executionId, context);

		const scheduler = new FlowScheduler(schedulerCtx);
		// Registered before the scheduler starts so that a refusal below is undone by the one removal that ends any execution.
		this.executions.start(executionId, scheduler, context, assignable);
		let readyItems: ReturnType<FlowScheduler['start']>;
		try {
			readyItems = scheduler.start(assignable as unknown as SchedulerStep[], depends);
		} catch (error) {
			return this.refuseAfterRecord(executionId, error);
		}

		if (hookDispatcher) {
			this.hooks.register(executionId, hookDispatcher);
		}

		this.queue.enqueueItems(readyItems, context);
		this.logWriter.writeExecution(executionId, `Execution started for flow ${flowId}`);
		this.hooks.dispatch(executionId, 'onFlowStart', { executionId, flowId, flowFile });

		this.tryDispatch();

		return { type: 'execution_started', executionId };
	}

	/**
	 * The scheduler refused the run (typically a top-level `when` reading a step it does not depend on) after its record,
	 * workspace and registry entries exist. The record ends `failed` with the reason (it stays for `flow show`), what was
	 * allocated is released, and the client gets the same reason. Nothing was queued or hooked yet.
	 *
	 * Declared secrets stay masked for the daemon's lifetime, as for any ended execution (see DaemonSecrets).
	 */
	private refuseAfterRecord(executionId: string, error: unknown): DaemonResponse {
		const { message: cause, stack } = normalizeError(error);
		const condition = describeConditionError(error);
		const reason =
			condition?.reason ??
			`Engine error while starting the execution: ${cause}. The execution was ended because it could not start; the daemon log has the stack.`;
		process.stderr.write(`[daemon] execution ${executionId}: ${reason}\n${stack ?? ''}\n`);
		try {
			if (condition === undefined) {
				this.executionStore.update(executionId, { lastError: reason });
			} else {
				this.executionStore.markStepFailed(executionId, condition.stepId, reason);
			}
			this.executionStore.markExecutionFailed(executionId);
			this.logWriter.writeExecution(executionId, `Execution refused at start: ${reason}`, 'error');
		} finally {
			this.executions.remove(executionId);
			this.workspaces.release(executionId, new Error(reason));
		}
		return {
			type: 'error',
			code: 'RUN_REFUSED_BY_ENGINE',
			message: `${reason} The execution ${executionId} is recorded as failed (flow show ${executionId}).`,
		};
	}

	/**
	 * Resolves the run's project (see {@link RunProjectResolver}); a refusal is logged and returned as the response to send.
	 */
	private resolveProject(
		cmd: Extract<ClientCommand, { type: 'run' }>
	): ({ ok: true } & RunProject) | { ok: false; response: DaemonResponse } {
		const outcome = this.projectResolver.resolve(cmd);
		if (!outcome.ok) {
			const message = outcome.response.type === 'error' ? outcome.response.message : 'unknown';
			this.logWriter.writeExecution('__project', `PROJECT_RESOLUTION_FAILED: ${message}`, 'error');
		}
		return outcome;
	}
}
