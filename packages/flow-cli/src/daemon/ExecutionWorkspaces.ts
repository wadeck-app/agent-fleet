import type { WorkspaceHandle, WorkspaceProvider } from 'extension-points';
import { releaseWorkspace } from 'extension-points';
import { redactGitText, redactSecrets } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine';
import { getErrorMessage, normalizeError } from 'shared-common/utils/getErrorMessage';

import type { DaemonResponse } from '../ipc/Protocol';
import type { LogWriter } from '../storage/LogWriter';
import { PluginMetaOwnership } from '../storage/PluginMetaOwnership';
import type { WorkspaceProviderSource } from '../workspace/WorkspaceProviders';

/** Where an execution runs and where its outputs are written. */
export type AllocatedWorkspace =
	| {
			ok: true;
			workspaceDir: string;
			workspaceMetaDir: string;
			/** True when the folder is shared and the flow must not modify it (advisory). */
			readOnly: boolean;
			/** Set only when the daemon created `workspaceMetaDir` itself (plugin provider): it may then be pruned with the record. */
			pluginMetaDir?: string;
	  }
	| { ok: false; response: DaemonResponse };

/** A run that has no workspace yet because the provider has none free: the allocation goes on in the background. */
export interface WorkspaceWaiting {
	/** Why it waits, as the provider first said it. */
	message: string;
	/** Settles when the wait ends: the workspace, or the reason it could not be given (also when cancelled). */
	settled: Promise<AllocatedWorkspace>;
	/** Stops waiting; `settled` then resolves to a refusal with the code `WORKSPACE_WAIT_CANCELLED`. */
	cancel: () => void;
	/** Told each later reason (the provider repeats it every minute). */
	onUpdate: (listener: (message: string) => void) => void;
}

export type BegunAllocation =
	{ state: 'ready'; allocated: AllocatedWorkspace } | { state: 'waiting'; waiting: WorkspaceWaiting };

/** Pause before the single retry of a failed release. */
const RELEASE_RETRY_DELAY_MS = 2_000;

/** Allocates the workspace of an execution through the provider its flow declares, and releases it when it is over. */
export class ExecutionWorkspaces {
	/** Per-execution workspace handles */
	private readonly pluginHandles = new Map<
		string,
		{ handle: WorkspaceHandle; provider: WorkspaceProvider; metaDir: string }
	>();
	private readonly metaOwnership = new PluginMetaOwnership();

	constructor(
		private readonly logWriter: LogWriter,
		private readonly providers: WorkspaceProviderSource
	) {}

	/**
	 * Allocates the workspace for a run that has been accepted so far, waiting for it when the provider has none free yet.
	 *
	 * A failure comes back as the refusal to send, carrying the message of the provider; nothing stays allocated then.
	 *
	 * @param projectDir Folder of the project the run belongs to, handed to the provider.
	 */
	async allocate(flow: FlowDefinition, executionId: string, projectDir: string): Promise<AllocatedWorkspace> {
		const begun = await this.begin(flow, executionId, projectDir);
		return begun.state === 'ready' ? begun.allocated : begun.waiting.settled;
	}

	/**
	 * Starts the allocation. Resolves as soon as it is known whether the run can start now (`ready`, or refused) or must wait for a
	 * free workspace (`waiting`): in that case the allocation goes on in the background and `waiting.settled` tells how it ends.
	 */
	async begin(flow: FlowDefinition, executionId: string, projectDir: string): Promise<BegunAllocation> {
		let provider: WorkspaceProvider;
		let warnings: string[];
		try {
			({ provider, warnings } = await this.providers.providerFor(flow));
		} catch (err) {
			this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR: ${String(err)}`, 'error');
			return {
				state: 'ready',
				allocated: {
					ok: false,
					response: {
						type: 'error',
						code: 'WORKSPACE_ERROR',
						message: redactGitText(normalizeError(err).message),
					},
				},
			};
		}
		for (const warning of warnings) {
			this.logWriter.writeExecution(executionId, warning, 'warning');
		}
		return this.allocateWithProvider(provider, flow, executionId, projectDir);
	}

	private async allocateWithProvider(
		provider: WorkspaceProvider,
		flow: FlowDefinition,
		executionId: string,
		projectDir: string
	): Promise<BegunAllocation> {
		const cancellation = new AbortController();
		let firstReason: ((message: string) => void) | undefined;
		const reasons = new Promise<string>(resolve => {
			firstReason = resolve;
		});
		let reasonSeen = false;
		const updateListeners: ((message: string) => void)[] = [];
		const allocation = provider
			.allocate({
				taskId: executionId,
				executionId,
				projectDir,
				flow: { id: flow.id, version: flow.version },
				signal: cancellation.signal,
				onWaiting: info => {
					if (!reasonSeen) {
						reasonSeen = true;
						firstReason?.(info.message);
						return;
					}
					for (const listener of updateListeners) {
						listener(info.message);
					}
				},
			})
			.then(
				handle => this.finishAllocation(provider, executionId, handle),
				(err: unknown): AllocatedWorkspace => this.refuseAllocation(err, cancellation.signal.aborted)
			);
		const first = await Promise.race([
			allocation.then(allocated => ({ allocated })),
			reasons.then(message => ({ message })),
		]);
		if ('allocated' in first) {
			return { state: 'ready', allocated: first.allocated };
		}
		return {
			state: 'waiting',
			waiting: {
				message: first.message,
				settled: allocation,
				cancel: () => cancellation.abort(),
				onUpdate: listener => {
					updateListeners.push(listener);
				},
			},
		};
	}

	private refuseAllocation(err: unknown, cancelled: boolean): AllocatedWorkspace {
		if (cancelled) {
			return {
				ok: false,
				response: {
					type: 'error',
					code: 'WORKSPACE_WAIT_CANCELLED',
					message: 'The wait for a workspace was cancelled; no workspace was claimed.',
				},
			};
		}
		// A provider whose git setup failed says so with this code and a message that is complete already.
		if ((err as { code?: unknown } | null)?.code === 'WORKSPACE_GIT_FAILED') {
			const message = redactSecrets(normalizeError(err).message);
			this.logWriter.writeExecution('__workspace', `WORKSPACE_GIT_FAILED: ${message}`, 'error');
			return { ok: false, response: { type: 'error', code: 'WORKSPACE_GIT_FAILED', message } };
		}
		this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(err)}`, 'error');
		return {
			ok: false,
			response: {
				type: 'error',
				code: 'WORKSPACE_ERROR',
				message: `Failed to allocate the workspace: ${redactGitText(normalizeError(err).message)}`,
			},
		};
	}

	/** The handle is in hand: prepares the `.meta` of the execution and registers the handle for the release. */
	private finishAllocation(
		provider: WorkspaceProvider,
		executionId: string,
		handle: WorkspaceHandle
	): AllocatedWorkspace {
		// Only a path that belongs to this execution alone can use the sibling `.meta`; a shared path brings its own metaDir.
		const workspaceMetaDir = handle.metaDir ?? handle.path + '.meta';
		let owned: boolean;
		try {
			owned = this.metaOwnership.create(workspaceMetaDir, executionId);
			this.pluginHandles.set(executionId, { handle, provider, metaDir: workspaceMetaDir });
		} catch (setupErr) {
			// Meta dir creation failed - release the handle before refusing the run
			void provider.release(handle).catch((releaseErr: unknown) => {
				process.stderr.write(
					`[CommandHandler] Failed to release plugin workspace "${handle.path}" after setup error for ${executionId}: ${String(releaseErr)}. Remove it by hand if nothing uses it.\n`
				);
			});
			this.logWriter.writeExecution('__workspace', `WORKSPACE_ERROR detail: ${String(setupErr)}`, 'error');
			return {
				ok: false,
				response: {
					type: 'error',
					code: 'WORKSPACE_ERROR',
					message: `The workspace "${handle.path}" was allocated but its metadata folder "${workspaceMetaDir}" cannot be prepared: ${normalizeError(setupErr).message}. Check that the folder is writable.`,
				},
			};
		}
		for (const note of handle.notes ?? []) {
			this.logWriter.writeExecution(executionId, note, 'warning');
		}
		return {
			ok: true,
			workspaceDir: handle.path,
			workspaceMetaDir,
			readOnly: handle.readOnly === true,
			...(owned ? { pluginMetaDir: workspaceMetaDir } : {}),
		};
	}

	/** `.meta` directories of the plugin workspaces in use now (owned or not): the record pruner must not delete them. */
	activeMetaDirs(): string[] {
		return [...this.pluginHandles.values()].map(entry => entry.metaDir);
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
				`[CommandHandler] Failed to release workspace "${entry.handle.path}" after setup error for ${executionId}: ${String(releaseErr)}. Remove it by hand if nothing uses it.\n`
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
					`[CommandHandler] Failed to release plugin workspace "${pluginWs.handle.path}" for ${executionId}: ${String(err)}. Remove it by hand if nothing uses it.\n`
				);
			});
		}
	}

	/**
	 * Releases the workspace of an execution that is over, retrying once after {@link RELEASE_RETRY_DELAY_MS} when the
	 * release fails (on Windows a file still held by a process that is exiting is the usual cause), and resolves in
	 * every case.
	 *
	 * The provider's `release` is called directly rather than through `releaseWorkspace`, so the original run error
	 * (`priorError`) is not carried here: a release failure is reported on its own and never replaces or hides it.
	 *
	 * Used only when the end of the run was announced to workers; {@link release} is unchanged for everything else. A
	 * second failure is reported in the execution log and on stderr with where the workspace is and that it must be
	 * removed by hand, since nothing else will.
	 */
	async releaseWithRetry(executionId: string, retryDelayMs: number = RELEASE_RETRY_DELAY_MS): Promise<void> {
		const pluginWs = this.pluginHandles.get(executionId);
		this.pluginHandles.delete(executionId);
		if (pluginWs) {
			await this.releaseTwice(
				executionId,
				pluginWs.handle.path,
				() => pluginWs.provider.release(pluginWs.handle),
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
		} catch (firstErr) {
			this.logWriter.writeExecution(
				executionId,
				`Releasing the workspace "${where}" failed (${getErrorMessage(firstErr)}); retrying once in ${String(Math.round(retryDelayMs / 1000))}s.`,
				'warning'
			);
		}
		await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
		try {
			await attempt();
		} catch (err) {
			const message = `Failed to release the workspace "${where}" after a retry: ${getErrorMessage(err)}. Nothing else will remove it: delete it by hand once nothing uses it.`;
			this.logWriter.writeExecution(executionId, message, 'error');
			process.stderr.write(`[CommandHandler] execution ${executionId}: ${message}\n`);
		}
	}
}
