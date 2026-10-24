import type { WorkspaceHandle, WorkspaceProvider } from 'extension-points';
import { releaseWorkspace } from 'extension-points';
import { WorkspaceManager } from 'flow-engine';
import type { FlowDefinition, FlowPluginOverrides } from 'flow-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { DaemonResponse } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';

/** Where an execution runs and where its outputs are written. */
export type AllocatedWorkspace =
	{ ok: true; workspaceDir: string; workspaceMetaDir: string } | { ok: false; response: DaemonResponse };

/** Allocates the workspace of an execution (plugin provider or native manager) and releases it when it is over. */
export class ExecutionWorkspaces {
	/** Per-execution plugin workspace handles (only when a workspace provider is used) */
	private readonly pluginHandles = new Map<string, { handle: WorkspaceHandle; provider: WorkspaceProvider }>();
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
		try {
			fs.mkdirSync(path.join(workspaceMetaDir, 'outputs'), { recursive: true });
			this.pluginHandles.set(executionId, { handle, provider });
		} catch (setupErr) {
			// Meta dir creation failed - release the handle before propagating
			void provider.release(handle).catch((releaseErr: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release plugin workspace after setup error for ${executionId}: ${String(releaseErr)}\n`
				);
			});
			throw setupErr;
		}
		return { ok: true, workspaceDir: handle.path, workspaceMetaDir };
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
}
