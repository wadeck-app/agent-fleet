import type { WorkspaceHandle, WorkspaceProvider } from 'extension-points';
import { releaseWorkspace } from 'extension-points';
import { WorkspaceManager } from 'flow-engine';
import type { FlowDefinition, FlowPluginOverrides } from 'flow-engine';

import type { DaemonResponse } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';
import { PluginMetaOwnership } from '../storage/PluginMetaOwnership';

/** Where an execution runs and where its outputs are written. */
export type AllocatedWorkspace =
	| {
			ok: true;
			workspaceDir: string;
			workspaceMetaDir: string;
			/** Set only when the daemon created `workspaceMetaDir` itself (plugin provider): it may then be pruned with the record. */
			pluginMetaDir?: string;
	  }
	| { ok: false; response: DaemonResponse };

/** Pause before the single retry of a failed release. */
const RELEASE_RETRY_DELAY_MS = 2_000;

/** Allocates the workspace of an execution (plugin provider or native manager) and releases it when it is over. */
export class ExecutionWorkspaces {
	/** Per-execution plugin workspace handles (only when a workspace provider is used) */
	private readonly pluginHandles = new Map<
		string,
		{ handle: WorkspaceHandle; provider: WorkspaceProvider; metaDir: string }
	>();
	private readonly metaOwnership = new PluginMetaOwnership();
	/** Per-execution WorkspaceManager handles for the non-plugin path */
	private readonly nativeManagers = new Map<string, { manager: WorkspaceManager; workspaceId: string }>();

	constructor(
		private readonly logWriter: LogWriter,
		private readonly workspaceProvider?: WorkspaceProvider,
		private readonly resolvePerFlowWorkspaceProvider?: (
			section: NonNullable<FlowPluginOverrides['workspace']>
		) => Promise<WorkspaceProvider>
	) {}

	/**
	 * Allocates the workspace for a run that has been accepted so far.
	 *
	 * A failure comes back as the refusal to send; nothing stays allocated then.
	 */
	async allocate(cwd: string, flow: FlowDefinition, executionId: string): Promise<AllocatedWorkspace> {
		// Resolve per-flow workspace provider override if the flow declares one
		let effectiveWorkspaceProvider: WorkspaceProvider | undefined = this.workspaceProvider;
		if (flow.plugins?.workspace && this.resolvePerFlowWorkspaceProvider) {
			try {
				effectiveWorkspaceProvider = await this.resolvePerFlowWorkspaceProvider(flow.plugins.workspace);
			} catch (err) {
				this.logWriter.writeExecution('__workspace', `PER_FLOW_WORKSPACE_ERROR: ${String(err)}`, 'error');
				return {
					ok: false,
					response: {
						type: 'error',
						code: 'WORKSPACE_ERROR',
						message: `Failed to resolve per-flow workspace provider: ${String(err)}`,
					},
				};
			}
		}

		if (effectiveWorkspaceProvider) {
			return this.allocateWithProvider(effectiveWorkspaceProvider, executionId);
		}
		return this.allocateNative(cwd, flow, executionId);
	}

	private async allocateWithProvider(provider: WorkspaceProvider, executionId: string): Promise<AllocatedWorkspace> {
		let handle: WorkspaceHandle;
		try {
			handle = await provider.allocate({ taskId: executionId });
		} catch (err) {
			this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(err)}`, 'error');
			return {
				ok: false,
				response: {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: 'Failed to allocate workspace via plugin provider.',
				},
			};
		}
		const workspaceMetaDir = handle.path + '.meta';
		let owned: boolean;
		try {
			owned = this.metaOwnership.create(workspaceMetaDir, executionId);
			this.pluginHandles.set(executionId, { handle, provider, metaDir: workspaceMetaDir });
		} catch (setupErr) {
			// Meta dir creation failed - release the handle before propagating
			void provider.release(handle).catch((releaseErr: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release plugin workspace after setup error for ${executionId}: ${String(releaseErr)}\n`
				);
			});
			throw setupErr;
		}
		return {
			ok: true,
			workspaceDir: handle.path,
			workspaceMetaDir,
			...(owned ? { pluginMetaDir: workspaceMetaDir } : {}),
		};
	}

	/** `.meta` directories of the plugin workspaces in use now (owned or not): the record pruner must not delete them. */
	activeMetaDirs(): string[] {
		return [...this.pluginHandles.values()].map(entry => entry.metaDir);
	}

	private async allocateNative(cwd: string, flow: FlowDefinition, executionId: string): Promise<AllocatedWorkspace> {
		const manager = new WorkspaceManager(cwd);
		let workspace: Awaited<ReturnType<typeof manager.allocate>>;
		try {
			workspace = await manager.allocate({
				taskId: executionId,
				config: flow.workspace,
				existingPath: cwd,
			});
		} catch (err) {
			this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(err)}`, 'error');
			return {
				ok: false,
				response: {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: 'Failed to allocate workspace. Ensure the flow workspace directory is writable.',
				},
			};
		}
		this.nativeManagers.set(executionId, { manager, workspaceId: workspace.id });
		return { ok: true, workspaceDir: workspace.path, workspaceMetaDir: workspace.metaDir };
	}

	/** Releases a plugin workspace when the execution could not be recorded after it was allocated. */
	releaseAfterSetupFailure(executionId: string): void {
		const entry = this.pluginHandles.get(executionId);
		if (!entry) {
			return;
		}
		this.pluginHandles.delete(executionId);
		void entry.provider.release(entry.handle).catch((releaseErr: unknown) => {
			process.stderr.write(
				`[CommandHandler] Failed to release workspace after setup error for ${executionId}: ${String(releaseErr)}\n`
			);
		});
	}

	/** Releases the workspace of an execution that is over. */
	release(executionId: string, priorError?: unknown): void {
		const pluginWs = this.pluginHandles.get(executionId);
		if (pluginWs) {
			this.pluginHandles.delete(executionId);
			void releaseWorkspace(pluginWs.provider, pluginWs.handle, priorError).catch((err: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release plugin workspace for ${executionId}: ${String(err)}\n`
				);
			});
		}

		const nativeWs = this.nativeManagers.get(executionId);
		if (nativeWs) {
			this.nativeManagers.delete(executionId);
			void nativeWs.manager.release(nativeWs.workspaceId, executionId).catch((err: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release workspace for ${executionId}: ${String(err)}\n`
				);
			});
		}
	}

	/**
	 * Releases the workspace of an execution that is over, retrying once after {@link RELEASE_RETRY_DELAY_MS} when the
	 * release fails (on Windows a file still held by a process that is exiting is the usual cause), and resolves in
	 * every case.
	 *
	 * Used only when the end of the run was announced to workers; {@link release} is unchanged for everything else. A
	 * second failure is reported in the execution log and on stderr with where the workspace is and that it must be
	 * removed by hand, since nothing else will.
	 */
	async releaseWithRetry(executionId: string, retryDelayMs: number = RELEASE_RETRY_DELAY_MS): Promise<void> {
		const pluginWs = this.pluginHandles.get(executionId);
		const nativeWs = this.nativeManagers.get(executionId);
		this.pluginHandles.delete(executionId);
		this.nativeManagers.delete(executionId);
		if (pluginWs) {
			await this.releaseTwice(
				executionId,
				pluginWs.handle.path,
				() => pluginWs.provider.release(pluginWs.handle),
				retryDelayMs
			);
		}
		if (nativeWs) {
			await this.releaseTwice(
				executionId,
				nativeWs.workspaceId,
				() => nativeWs.manager.release(nativeWs.workspaceId, executionId),
				retryDelayMs
			);
		}
	}

	private async releaseTwice(
		executionId: string,
		where: string,
		attempt: () => Promise<void>,
		retryDelayMs: number
	): Promise<void> {
		try {
			await attempt();
			return;
		} catch {
			// Tried once more below; only a second failure is worth saying.
		}
		await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
		try {
			await attempt();
		} catch (err) {
			const message = `Failed to release the workspace "${where}" after a retry: ${String(err)}. Nothing else will remove it: delete it by hand once nothing uses it.`;
			this.logWriter.writeExecution(executionId, message, 'error');
			process.stderr.write(`[CommandHandler] execution ${executionId}: ${message}
`);
		}
	}
}
