import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { generateExecutionId } from 'flow-core';
import type { RunRequirementsRecord } from 'flow-core';
import type { ResolvedDefinition } from 'flow-core';
import { FlowScheduler, ReadOnlyWorkspaceRules } from 'flow-engine';
import type { FlowDefinition, SchedulerContext, SchedulerStep } from 'flow-engine';
import type { FlowStep } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { ClientCommand, DaemonResponse, ExecutionContext } from '../ipc/Protocol';
import type { ExecutionSecrets } from '../secrets/ExecutionSecrets';
import { SecretsResolutionFailedError } from '../secrets/SecretErrors';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { DeclaredGuarantees } from './DeclaredGuarantees.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { AllocatedWorkspace, ExecutionWorkspaces, WorkspaceWaiting } from './ExecutionWorkspaces.js';
import type { FlowFileAccessGuard } from './FlowFileAccessGuard.js';
import { FlowWorkspaceKind } from './FlowWorkspaceKind.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import type { RunDefinitionLoader } from './RunDefinitionLoader.js';
import { RunIdempotencyCache } from './RunIdempotencyCache';
import { checkRunOrigin } from './RunOriginCheck.js';
import { RunProjectResolver } from './RunProjectResolver.js';
import type { RunProject } from './RunProjectResolver.js';
import { resolveRunRequirements } from './RunRequirements.js';
import type { RunStepPreparer } from './RunStepPreparer.js';
import { describeConditionError } from './SchedulerConditionError.js';
import { WorkspaceKindAcceptance } from './WorkspaceKindAcceptance.js';
import type { WorkspaceWaitSupervisor } from './WorkspaceWaitSupervisor.js';

type RunCommand = Extract<ClientCommand, { type: 'run' }>;
type ReadyWorkspace = Extract<AllocatedWorkspace, { ok: true }>;

/** A run request that passed every check made before its workspace is asked for. */
interface AcceptedRun {
	cmd: RunCommand;
	runCwd: string;
	projectRoot: string;
	projectId: string;
	flowFile: string;
	resolved: ResolvedDefinition;
	flow: FlowDefinition;
	secrets: ExecutionSecrets;
	hookDispatcher: HookDispatcher | undefined;
	/** Resolved when the run was accepted (or read back from the record when it starts again); undefined when nothing is required. */
	requirements: RunRequirementsRecord | undefined;
}

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
		private readonly waitSupervisor: WorkspaceWaitSupervisor,
		private readonly projectResolver: RunProjectResolver = new RunProjectResolver(),
		private readonly idempotency: RunIdempotencyCache<DaemonResponse> = new RunIdempotencyCache<DaemonResponse>(),
		/** Read before a flow is checked: which requirements the declared sources may provide. Absent, requirements are checked for syntax only. */
		private readonly declaredGuarantees?: Pick<DeclaredGuarantees, 'refresh' | 'providersOfAll' | 'workspacesOf'>
	) {
		this.workspaceKinds =
			declaredGuarantees === undefined ? undefined : new WorkspaceKindAcceptance(declaredGuarantees);
	}

	/** Refuses, before any workspace exists, a run only sources that do not accept its workspace kind could serve. */
	private readonly workspaceKinds: WorkspaceKindAcceptance | undefined;

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
	handleRun(cmd: RunCommand, hookDispatcher?: HookDispatcher, resolvedProject?: RunProject): Promise<DaemonResponse> {
		if (cmd.requestId === undefined) {
			return this.startRun(cmd, hookDispatcher, resolvedProject);
		}
		return this.idempotency.run(cmd.requestId, () => this.startRun(cmd, hookDispatcher, resolvedProject));
	}

	private async startRun(
		cmd: RunCommand,
		hookDispatcher?: HookDispatcher,
		resolvedProject?: RunProject
	): Promise<DaemonResponse> {
		// The sources are asked what they may provide before the flow is checked against it (the daemon may have just started).
		await this.declaredGuarantees?.refresh();
		const accepted = this.accept(cmd, hookDispatcher, resolvedProject);
		if ('response' in accepted) {
			return accepted.response;
		}
		const executionId = generateExecutionId();
		// From here on every line written for this execution is masked.
		this.daemonSecrets.activate(executionId, accepted.flow, accepted.secrets, accepted.runCwd);
		return this.allocateAndStart(accepted, executionId, false);
	}

	/**
	 * Starts again a run that was waiting for a workspace when the daemon stopped (see `ExecutionState.workspaceWait`):
	 * from the definition it was accepted with, with its secrets resolved again, in the order the runs arrived (the caller
	 * calls this one run after the other). It waits again if no slot is free, or starts. A run that cannot be started again
	 * is failed with the reason and how to run it again; nothing is left waiting silently.
	 *
	 * @param hooksFor The hooks of the project of the run (the project config is read again, as for a new run).
	 */
	async resumeWaiting(
		executionId: string,
		hooksFor: (project: RunProject) => HookDispatcher | undefined
	): Promise<void> {
		let state;
		try {
			state = this.executionStore.read(executionId);
		} catch (err) {
			process.stderr.write(
				`[daemon] cannot read the waiting execution ${executionId}: ${normalizeError(err).message}. Inspect or delete its record.\n`
			);
			return;
		}
		const wait = state.workspaceWait;
		if (wait === undefined) {
			return;
		}
		// Nothing read them yet after a start: a step that waits for a requirement needs them to know which source to ask.
		await this.declaredGuarantees?.refresh();
		const unable = (why: string): string =>
			`The waiting execution ${executionId} could not be started again after the daemon restarted: ${why} Run it again with: flow run ${state.flowFile}`;
		try {
			const cmd = wait.run as unknown as RunCommand;
			const project = this.projectResolver.resolve(cmd);
			if (!project.ok) {
				this.failRecorded(
					executionId,
					unable(`its project cannot be found (${responseMessage(project.response)}).`)
				);
				return;
			}
			if (state.definitionSnapshot === undefined) {
				this.failRecorded(executionId, unable('its record names no definition snapshot.'));
				return;
			}
			const loaded = this.definitionLoader.loadSnapshot(state.definitionSnapshot, state.versionChoice ?? 'file');
			if (!loaded.ok) {
				this.failRecorded(
					executionId,
					unable(`its definition cannot be loaded (${responseMessage(loaded.response)}).`)
				);
				return;
			}
			const flow = loaded.resolved.flow;
			// The stored requirements and the stored definition decide, as for a new run: nothing is allocated for a run refused.
			const refusedKind = this.workspaceKinds?.check(flow.id, FlowWorkspaceKind.of(flow), state.requirements);
			if (refusedKind !== undefined) {
				this.failRecorded(executionId, unable(refusedKind));
				return;
			}
			let secrets: ExecutionSecrets;
			try {
				secrets = this.daemonSecrets.prepare(flow, cmd.inputs ?? {}, project.runCwd);
			} catch (err) {
				if (!(err instanceof SecretsResolutionFailedError)) {
					throw err;
				}
				this.failRecorded(executionId, unable(`${normalizeError(err).message}.`));
				return;
			}
			this.daemonSecrets.activate(executionId, flow, secrets, project.runCwd);
			await this.allocateAndStart(
				{
					cmd,
					runCwd: project.runCwd,
					projectRoot: project.projectPath,
					projectId: project.project.id,
					flowFile: state.flowFile,
					resolved: loaded.resolved,
					flow,
					secrets,
					hookDispatcher: hooksFor(project),
					// The record is the truth: the definition is never read again for what a run requires.
					requirements: state.requirements,
				},
				executionId,
				true
			);
		} catch (err) {
			process.stderr.write(`[daemon] execution ${executionId}: ${normalizeError(err).stack ?? String(err)}\n`);
			this.failRecorded(executionId, unable(`${normalizeError(err).message}.`));
		}
	}

	/** Every check that needs no workspace; a refusal leaves nothing behind. */
	private accept(
		cmd: RunCommand,
		hookDispatcher: HookDispatcher | undefined,
		resolvedProject: RunProject | undefined
	): AcceptedRun | { response: DaemonResponse } {
		const invalidOrigin = checkRunOrigin(cmd.origin);
		if (invalidOrigin) {
			return { response: invalidOrigin };
		}
		// Resolved before anything is read or allocated, so a refusal leaves nothing behind. Every run belongs to a registered
		// project; the working directory is the client's cwd, or the project folder when the client named the project from elsewhere.
		const project = resolvedProject ? { ok: true as const, ...resolvedProject } : this.resolveProject(cmd);
		if (!project.ok) {
			return { response: project.response };
		}
		const { runCwd } = project;
		const flowFile = this.accessGuard.resolve(cmd.flowFile, runCwd);
		if (!this.accessGuard.isAllowed(flowFile, runCwd)) {
			return { response: { type: 'error', code: 'FLOW_NOT_FOUND', message: 'Flow file not found.' } };
		}

		// A registered id is resolved (latest or pinned version) and a flow file is parsed as it is; either way the
		// result is validated and nothing is written yet (the snapshot is committed once the run is accepted, below).
		const loaded = this.definitionLoader.load(cmd, flowFile);
		if (!loaded.ok) {
			return { response: loaded.response };
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
				response: {
					type: 'error',
					code: 'UNSUPPORTED_STEP_TYPE',
					message: `Step '${subflowStep.id}' is of type 'subflow' which is not supported in v1.`,
				},
			};
		}

		const unmockable = this.stepPreparer.refuseUnmockableTargets(flow, cmd.mockEnv);
		if (unmockable) {
			return { response: unmockable };
		}

		// Resolved once, here: what the run requires is then recorded and enforced as it is, whatever happens to the
		// definition afterwards. The validator already refused a malformed `requires`; this is the guard for a path that skipped it.
		let requirements: RunRequirementsRecord | undefined;
		try {
			requirements = resolveRunRequirements(flow);
		} catch (err) {
			return { response: { type: 'error', code: 'INVALID_REQUIREMENTS', message: normalizeError(err).message } };
		}

		// Still before anything exists: the sources that can serve the requirements must accept the workspace kind of the flow.
		const refusedKind = this.workspaceKinds?.check(flow.id, FlowWorkspaceKind.of(flow), requirements);
		if (refusedKind !== undefined) {
			return { response: { type: 'error', code: 'WORKSPACE_KIND_NOT_ACCEPTED', message: refusedKind } };
		}

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
			return {
				response: { type: 'error', code: 'SECRET_RESOLUTION_FAILED', message: normalizeError(err).message },
			};
		}

		return {
			cmd,
			runCwd,
			projectRoot: project.projectPath,
			projectId: project.project.id,
			flowFile,
			resolved,
			flow,
			secrets,
			hookDispatcher,
			requirements,
		};
	}

	/**
	 * Asks for the workspace; the run starts now, is refused, or (a pool with no free slot) is recorded as waiting and
	 * started later. `recorded`: the execution already has its record (a waiting run started again after a restart).
	 */
	private async allocateAndStart(
		accepted: AcceptedRun,
		executionId: string,
		recorded: boolean
	): Promise<DaemonResponse> {
		const begun = await this.workspaces.begin(accepted.flow, executionId, accepted.projectRoot);
		if (begun.state === 'waiting') {
			return this.park(accepted, executionId, begun.waiting, recorded);
		}
		if (!begun.allocated.ok) {
			if (recorded) {
				this.failRecorded(executionId, responseMessage(begun.allocated.response));
			}
			return begun.allocated.response;
		}
		return this.launch(accepted, executionId, begun.allocated, recorded);
	}

	/** Records the run as waiting for a workspace (or keeps it so) and hands it to the supervisor, which starts it later. */
	private park(
		accepted: AcceptedRun,
		executionId: string,
		waiting: WorkspaceWaiting,
		recorded: boolean
	): DaemonResponse {
		const { resolved, cmd } = accepted;
		if (recorded) {
			const current = this.executionStore.read(executionId).workspaceWait;
			if (current !== undefined) {
				this.executionStore.update(executionId, { workspaceWait: { ...current, message: waiting.message } });
			}
		} else {
			// The definition is frozen now that the run is accepted: the snapshot is what the run starts from later.
			resolved.commit();
			for (const warning of resolved.warnings) {
				this.logWriter.writeExecution(executionId, warning, 'warning');
			}
			// `requestId` only serves the idempotency of the request that was just answered.
			const { requestId: _requestId, ...run } = cmd;
			this.createRecord(accepted, executionId, undefined, {
				since: new Date().toISOString(),
				message: waiting.message,
				run: run as unknown as Record<string, unknown>,
			});
		}
		this.logWriter.writeExecution(executionId, waiting.message, 'warning');
		this.waitSupervisor.watch(executionId, waiting, workspace => {
			this.launch(accepted, executionId, workspace, true);
		});
		return { type: 'execution_started', executionId };
	}

	private launch(
		accepted: AcceptedRun,
		executionId: string,
		workspace: ReadyWorkspace,
		recorded: boolean
	): DaemonResponse {
		const { cmd, runCwd, projectRoot, projectId, flowFile, resolved, flow, secrets, hookDispatcher } = accepted;
		const { workspaceDir, workspaceMetaDir, pluginMetaDir, readOnly } = workspace;
		if (readOnly) {
			// The provider decided the folder is read-only (the `readonly` provider, or a third-party one): refuse a flow whose model
			// steps ask for tools able to modify it, before anything runs.
			const writing = ReadOnlyWorkspaceRules.findWritingSteps(flow.steps);
			if (writing.length > 0) {
				const conflict = ReadOnlyWorkspaceRules.describeConflict(writing);
				const message = `${conflict.message} ${conflict.suggestion}`;
				this.workspaces.releaseAfterSetupFailure(executionId);
				this.logWriter.writeExecution(
					'__workspace',
					`WORKSPACE_READONLY_CONFLICT: ${conflict.message}`,
					'error'
				);
				if (recorded) {
					this.failRecorded(executionId, message);
				}
				return { type: 'error', code: 'WORKSPACE_READONLY_CONFLICT', message };
			}
		}

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
			// Same for the requirements: read per placement from the execution, so a step injected later inherits them.
			if (accepted.requirements !== undefined) {
				this.executions.bindRequirements(executionId, accepted.requirements);
			}
			// And the kind of workspace, which the routing filter compares with what the sources accept.
			const workspaceKind = FlowWorkspaceKind.of(flow);
			if (workspaceKind !== undefined) {
				this.executions.bindWorkspaceKind(executionId, workspaceKind);
			}
			if (recorded) {
				// It has waited: the record exists and now gets its workspace; the waiting trace goes.
				// The wait is not run time: the run starts now, and says how long it waited.
				const since = this.executionStore.read(executionId).workspaceWait?.since;
				const now = new Date();
				this.executionStore.update(executionId, {
					...(pluginMetaDir === undefined ? {} : { pluginMetaDir }),
					workspaceWait: undefined,
					startedAt: now.toISOString(),
					...(since === undefined
						? {}
						: { workspaceWaitedMs: Math.max(0, now.getTime() - new Date(since).getTime()) }),
				});
			} else {
				// The definition is frozen only now that the run is accepted: a refused run must not claim its version.
				resolved.commit();
				for (const warning of resolved.warnings) {
					this.logWriter.writeExecution(executionId, warning, 'warning');
				}
				this.createRecord(accepted, executionId, pluginMetaDir, undefined);
			}
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
			...(readOnly ? { workspaceReadOnly: true } : {}),
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
		this.logWriter.writeExecution(executionId, `Execution started for flow ${resolved.flowId}`);
		this.hooks.dispatch(executionId, 'onFlowStart', { executionId, flowId: resolved.flowId, flowFile });

		this.tryDispatch();

		return { type: 'execution_started', executionId };
	}

	private createRecord(
		accepted: AcceptedRun,
		executionId: string,
		pluginMetaDir: string | undefined,
		workspaceWait: ReturnType<ExecutionStore['read']>['workspaceWait']
	): void {
		const { flow, resolved, flowFile, projectId, projectRoot, cmd } = accepted;
		this.executionStore.create({
			executionId,
			flowFile,
			flowId: resolved.flowId,
			stepIds: flow.steps.map((s: FlowStep) => s.id),
			stepWaves: Object.fromEntries(
				flow.steps.filter((s: FlowStep) => s.wave !== undefined).map((s: FlowStep) => [s.id, s.wave as number])
			),
			projectId,
			projectRoot,
			...(cmd.origin === undefined ? {} : { origin: cmd.origin }),
			pluginMetaDir,
			...(workspaceWait === undefined ? {} : { workspaceWait }),
			// Beside the definition, not in it: the snapshot and its hash describe the flow as written.
			...(accepted.requirements === undefined ? {} : { requirements: accepted.requirements }),
			definition: {
				flowVersion: resolved.version,
				definitionHash: resolved.hash,
				definitionSnapshot: resolved.definitionSnapshot,
				versionChoice: resolved.choice,
			},
		});
	}

	/** A recorded run that cannot start: it ends `failed` with the reason (shown by `flow show`) and no longer waits. */
	private failRecorded(executionId: string, reason: string): void {
		this.logWriter.writeExecution(executionId, reason, 'error');
		try {
			this.executionStore.update(executionId, { lastError: reason, workspaceWait: undefined });
			this.executionStore.markExecutionFailed(executionId);
		} catch (err) {
			process.stderr.write(
				`[daemon] execution ${executionId} could not be recorded as failed: ${normalizeError(err).message}. Reason: ${reason}\n`
			);
		}
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
	private resolveProject(cmd: RunCommand): ({ ok: true } & RunProject) | { ok: false; response: DaemonResponse } {
		const outcome = this.projectResolver.resolve(cmd);
		if (!outcome.ok) {
			this.logWriter.writeExecution(
				'__project',
				`PROJECT_RESOLUTION_FAILED: ${responseMessage(outcome.response)}`,
				'error'
			);
		}
		return outcome;
	}
}

function responseMessage(response: DaemonResponse): string {
	return response.type === 'error' ? response.message : 'unknown';
}
