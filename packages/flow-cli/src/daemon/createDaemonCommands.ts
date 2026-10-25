import { HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import type { HookConfig } from '@wadeck-app/shared-cli/HookDispatcher';

import type { FlowConfig } from '../config/FlowConfig';
import type { ClientCommand, UpdateWorkerRequest } from '../ipc/Protocol';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { RunProjectResolver } from './RunProjectResolver.js';
import { loadFlowHooks } from './loadFlowHooks.js';
import { pruneProjectWorkspaces } from './pruneProjectWorkspaces.js';

/** The IPC commands the daemon answers, bound to the runtime once it exists. */
export function createDaemonCommands(
	config: FlowConfig,
	runtime: () => DaemonRuntime,
	projectResolver: RunProjectResolver = new RunProjectResolver()
): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
	return {
		run: async (payload: unknown): Promise<unknown> => {
			const cmd = payload as Extract<ClientCommand, { type: 'run' }>;
			// The daemon serves every project: it resolves this run's from what the client sent (cwd, --project,
			// FLOW_PROJECT), per request, and a refusal is a typed response before anything is pruned or read.
			const project = projectResolver.resolve(cmd);
			if (!project.ok) {
				return project.response;
			}
			pruneProjectWorkspaces(project.projectPath, config);
			const flowHooks: Record<string, HookConfig[]> = loadFlowHooks(project.projectPath);
			return runtime().commandHandler.handleRun(cmd, new HookDispatcher(flowHooks), project);
		},
		// Resumes an execution kept alive after a `user_intervention` step timed out
		// unanswered (see CommandHandler.handleResume). Only works against this same
		// daemon process -- there is no on-disk reconstruction of in-memory state.
		resume: (payload: unknown): unknown => {
			const { executionId } = payload as Extract<ClientCommand, { type: 'resume' }>;
			if (typeof executionId !== 'string' || executionId.trim() === '') {
				throw new Error('resume requires a non-empty "executionId".');
			}
			return runtime().commandHandler.handleResume(executionId);
		},
		// Live connections only: a declared source with nothing connected is not
		// capacity, and reporting it as available would suggest a step could reach it (D#4).
		workers: (): unknown => runtime().workerRegistry.summarize(),
		// Proposal 3: updates an already-connected worker's labels/shellCapabilities on
		// this daemon's registry, so the next tryDispatch() sees them without a restart.
		// Thrown errors (unknown workerId, blank label, unknown shell) propagate to the
		// CLI as a rejected command -- there is no silent no-op path here.
		// `flow cli update --drain` / `--cancel-drain`: see CommandHandler.setDraining.
		setDraining: (payload: unknown): unknown => {
			const { draining } = payload as { draining?: unknown };
			if (typeof draining !== 'boolean') {
				throw new Error('setDraining requires a boolean "draining".');
			}
			runtime().commandHandler.setDraining(draining);
			return { draining };
		},
		updateWorker: (payload: unknown): unknown => {
			const { workerId, labels, shellCapabilities } = payload as UpdateWorkerRequest;
			if (typeof workerId !== 'string' || workerId.trim() === '') {
				throw new Error('updateWorker requires a non-empty "workerId".');
			}
			const { workerRegistry } = runtime();
			workerRegistry.updateWorker(workerId, { labels, shellCapabilities });
			return workerRegistry.summarize().find(w => w.workerId === workerId);
		},
	};
}
