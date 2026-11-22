import type { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { FlowScheduler } from 'flow-engine';
import type { ReadyItem, SchedulerContext } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { AssignableStep, ClientCommand, ExecutionContext } from '../ipc/Protocol';
import { SecretsResolutionFailedError } from '../secrets/SecretErrors';
import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { PausedRunSnapshot } from '../storage/PausedRunSnapshotStore';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionHooks } from './ExecutionHooks.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ExecutionWorkspaces } from './ExecutionWorkspaces.js';
import { FlowWorkspaceKind } from './FlowWorkspaceKind.js';
import type { PausedRunSnapshots } from './PausedRunSnapshots.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';
import type { RunDefinitionLoader } from './RunDefinitionLoader.js';
import type { RunProject, RunProjectResolver } from './RunProjectResolver.js';

type RunCommand = Extract<ClientCommand, { type: 'run' }>;

/** What the restorer needs, each as the narrowest view of the collaborator that owns it. */
export interface PausedRunRestorerParts {
	definitionLoader: Pick<RunDefinitionLoader, 'loadSnapshot'>;
	projectResolver: Pick<RunProjectResolver, 'resolve'>;
	daemonSecrets: Pick<DaemonSecrets, 'prepare' | 'activate'>;
	workspaces: Pick<ExecutionWorkspaces, 'adopt'>;
	executions: Pick<
		ExecutionRegistry,
		| 'start'
		| 'remove'
		| 'setProject'
		| 'bindRequirements'
		| 'bindWorkspaceKind'
		| 'bindRunCommand'
		| 'setStepCount'
		| 'pause'
	>;
	queue: Pick<ReadyStepQueue, 'enqueueItems'>;
	hooks: Pick<ExecutionHooks, 'register'>;
	store: Pick<
		ExecutionStore,
		'read' | 'update' | 'markExecutionFailed' | 'markStepsRequeuedAfterRestart' | 'pausedSnapshots'
	>;
	logWriter: Pick<LogWriter, 'writeExecution'>;
	snapshots: Pick<PausedRunSnapshots, 'persist'>;
}

/**
 * After a daemon restart: puts a run that was paused (and persisted, see `PausedRunSnapshots`) back where it was, still paused.
 * The completed steps stay completed with their outputs, the steps that were waiting in the queue wait again, the steps that
 * were running (their worker is gone) are queued as a new attempt, the workspace is taken back from its provider and the
 * secrets are resolved again from their references. `flow unpause` then continues the run.
 *
 * Never throws: a run that cannot be restored ends as `failed` with the reason and how to run it again, never silently.
 */
export class PausedRunRestorer {
	constructor(private readonly parts: PausedRunRestorerParts) {}

	/** @param hooksFor The hooks of the project of the run (the project config is read again, as for a new run). */
	async restore(executionId: string, hooksFor: (project: RunProject) => HookDispatcher | undefined): Promise<void> {
		const { store } = this.parts;
		let flowFile = '(unknown flow file)';
		try {
			const state = store.read(executionId);
			flowFile = state.flowFile;
			if (state.paused === undefined) {
				return;
			}
			const failure = await this.restoreOrExplain(executionId, hooksFor);
			if (failure !== undefined) {
				this.fail(executionId, flowFile, failure);
			}
		} catch (err) {
			process.stderr.write(`[daemon] execution ${executionId}: ${normalizeError(err).stack ?? String(err)}\n`);
			this.fail(executionId, flowFile, `${normalizeError(err).message}.`);
		}
	}

	/** Returns why the run could not be restored, or undefined once it is restored. */
	private async restoreOrExplain(
		executionId: string,
		hooksFor: (project: RunProject) => HookDispatcher | undefined
	): Promise<string | undefined> {
		const { store, daemonSecrets, workspaces, executions, queue, hooks, logWriter, snapshots } = this.parts;
		const state = store.read(executionId);
		const read = store.pausedSnapshots.read(executionId);
		if (!read.ok) {
			return `${read.reason}.`;
		}
		const snapshot = read.snapshot;
		const cmd = snapshot.run as unknown as RunCommand;

		const project = this.parts.projectResolver.resolve(cmd);
		if (!project.ok) {
			return `its project cannot be found (${project.response.type === 'error' ? project.response.message : 'unknown'}).`;
		}
		if (state.definitionSnapshot === undefined) {
			return 'its record names no definition snapshot.';
		}
		const loaded = this.parts.definitionLoader.loadSnapshot(
			state.definitionSnapshot,
			state.versionChoice ?? 'file'
		);
		if (!loaded.ok) {
			return `its definition cannot be loaded (${loaded.response.type === 'error' ? loaded.response.message : 'unknown'}).`;
		}
		const flow = loaded.resolved.flow;

		// Secrets are never persisted: the references of the run are resolved again, so a rotated value is used and masked.
		let secrets;
		try {
			secrets = daemonSecrets.prepare(flow, cmd.inputs ?? {}, project.runCwd);
		} catch (err) {
			if (!(err instanceof SecretsResolutionFailedError)) {
				throw err;
			}
			return `${normalizeError(err).message}.`;
		}

		// The scheduler first: it only reads the snapshot, so a damaged one fails the run before any workspace is touched.
		const publicInputs = secrets.publicInputs(cmd.inputs ?? {});
		const schedulerContext: SchedulerContext = {
			inputs: publicInputs,
			stepOutputs: new Map(),
			subStepErrors: new Map(),
		};
		const scheduler = new FlowScheduler(schedulerContext);
		let lost: ReadyItem[];
		try {
			lost = scheduler.restore(snapshot.scheduler);
		} catch (err) {
			return `${normalizeError(err).message}`;
		}
		const unknownQueued = snapshot.queued.filter(id => !scheduler.getStepIds().has(id));
		if (unknownQueued.length > 0) {
			return `its snapshot queues step(s) ${unknownQueued.join(', ')} that the scheduler does not know: the snapshot is damaged.`;
		}

		// The point of no return: from here the workspace is held by this daemon again.
		const adopted = await workspaces.adopt(flow, executionId, project.projectPath, snapshot.workspace);
		if (!adopted.ok) {
			return adopted.response.type === 'error' ? adopted.response.message : 'its workspace cannot be taken back.';
		}

		daemonSecrets.activate(executionId, flow, secrets, project.runCwd);
		const context = this.contextOf(executionId, snapshot, publicInputs, adopted, project.runCwd, flow);
		const steps = Object.values(snapshot.scheduler.steps) as unknown as AssignableStep[];
		executions.start(executionId, scheduler, context, steps);
		try {
			executions.setStepCount(executionId, snapshot.stepCount);
			executions.setProject(executionId, { projectId: project.project.id, projectRoot: project.projectPath });
			executions.bindRunCommand(executionId, snapshot.run);
			if (state.requirements !== undefined) {
				executions.bindRequirements(executionId, state.requirements);
			}
			const workspaceKind = FlowWorkspaceKind.of(flow);
			if (workspaceKind !== undefined) {
				executions.bindWorkspaceKind(executionId, workspaceKind);
			}
			const dispatcher = hooksFor(project);
			if (dispatcher) {
				hooks.register(executionId, dispatcher);
			}
			executions.pause(executionId);

			const waiting: ReadyItem[] = snapshot.queued.map(stepId => ({
				stepId,
				step: snapshot.scheduler.steps[stepId]!,
			}));
			queue.enqueueItems([...waiting, ...lost], context);

			const lostIds = lost.map(item => item.stepId);
			const reason = `the daemon restarted while this execution was paused: the worker of this step is gone, so it is run again as a new attempt after flow unpause ${executionId}`;
			const requeued = store.markStepsRequeuedAfterRestart(executionId, lostIds, reason);
			for (const stepId of requeued) {
				logWriter.writeExecution(
					executionId,
					`Step ${stepId} was running when the daemon stopped: its worker is gone, it is queued again as a new attempt (it may already have had an effect).`,
					'warning'
				);
			}
			const completed = Object.keys(snapshot.context.stepOutputs).length;
			logWriter.writeExecution(
				executionId,
				`Execution restored after the daemon restarted, still paused: ${String(completed)} step(s) with outputs are kept, ${String(waiting.length)} step(s) were queued, ${String(lost.length)} step(s) were running and are queued again. Continue it with: flow unpause ${executionId}`,
				'warning'
			);
			const persisted = snapshots.persist(executionId);
			if (!persisted.ok) {
				logWriter.writeExecution(
					executionId,
					`This restored execution will NOT survive another daemon restart: ${persisted.reason}.`,
					'warning'
				);
			}
		} catch (err) {
			// In-memory registration broke: the run is not held, the workspace stays where it is (nothing is deleted for a failed restore).
			executions.remove(executionId);
			throw new Error(
				`${normalizeError(err).message}. The workspace "${adopted.workspaceDir}" was left untouched: inspect or remove it by hand`
			);
		}
		return undefined;
	}

	private contextOf(
		executionId: string,
		snapshot: PausedRunSnapshot,
		inputs: Record<string, string>,
		workspace: { workspaceDir: string; workspaceMetaDir: string; readOnly: boolean },
		cwd: string,
		flow: { id: string; version: string; workingDir?: string }
	): ExecutionContext {
		const saved = snapshot.context;
		return {
			executionId,
			inputs,
			stepOutputs: saved.stepOutputs,
			stepMeta: saved.stepMeta as ExecutionContext['stepMeta'],
			workspaceDir: workspace.workspaceDir,
			outputsDir: workspace.workspaceMetaDir + '/outputs',
			...(workspace.readOnly ? { workspaceReadOnly: true } : {}),
			cwd,
			...(flow.workingDir ? { flowWorkingDir: flow.workingDir } : {}),
			flowId: flow.id,
			flowVersion: flow.version,
			...(saved.subStepErrors === undefined ? {} : { subStepErrors: saved.subStepErrors }),
			...(saved.subSteps === undefined ? {} : { subSteps: saved.subSteps }),
			...(saved.subStepFeedback === undefined ? {} : { subStepFeedback: saved.subStepFeedback }),
		};
	}

	/** The run cannot be restored: it ends as failed with the reason and how to run it again. */
	private fail(executionId: string, flowFile: string, why: string): void {
		const { store, logWriter } = this.parts;
		const reason = `The paused execution ${executionId} could not be restored after the daemon restarted: ${why} Run it again with: flow run ${flowFile}`;
		logWriter.writeExecution(executionId, reason, 'error');
		try {
			store.update(executionId, { lastError: reason });
			store.markExecutionFailed(executionId);
		} catch (err) {
			process.stderr.write(
				`[daemon] execution ${executionId} could not be recorded as failed: ${normalizeError(err).message}. Reason: ${reason}\n`
			);
		}
	}
}
