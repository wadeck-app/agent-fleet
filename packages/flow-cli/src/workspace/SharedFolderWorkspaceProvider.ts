import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import { resolveWorkspaceFolder } from 'extension-points';

import { GitFolderProbe } from './GitFolderProbe';
import { runMetaDirFor } from './RunMetaDir';
import { WorkspaceOptionsReader } from './WorkspaceOptionsReader';

/**
 * The providers that hand out an existing folder shared with whoever else works there:
 *
 * - `in-place`: the project folder (or `dir`); nothing is checked about who else uses it. Warns about a folder that is not
 *   a git repository or has uncommitted changes.
 * - `readonly`: the same folder, flagged read-only. Advisory: it tells the executor what the flow intends, it enforces nothing.
 *
 * Release does nothing: the folder is never created nor deleted here.
 */
export class SharedFolderWorkspaceProvider implements WorkspaceProvider {
	private readonly dirOption: unknown;

	constructor(
		private readonly kind: 'in-place' | 'readonly',
		options: unknown,
		private readonly probe: GitFolderProbe = new GitFolderProbe()
	) {
		if (kind !== 'in-place' && kind !== 'readonly') {
			throw new Error(`SharedFolderWorkspaceProvider serves "in-place" or "readonly", not "${String(kind)}".`);
		}
		this.dirOption = new WorkspaceOptionsReader(kind, ['dir']).read(options)['dir'];
	}

	async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
		const folder = resolveWorkspaceFolder(this.dirOption, request.projectDir, 'dir');
		const notes = await this.notesFor(folder);
		return {
			path: folder,
			id: `${this.kind}:${request.executionId}`,
			// Per execution, under the project: the folder is shared, so a sibling `.meta` would collide between runs.
			metaDir: runMetaDirFor(request.projectDir, request.executionId),
			readOnly: this.kind === 'readonly',
			...(notes.length === 0 ? {} : { notes }),
		};
	}

	async release(_handle: WorkspaceHandle): Promise<void> {
		// Nothing to give back: the folder is shared and was not created here.
	}

	private async notesFor(folder: string): Promise<string[]> {
		if (this.kind === 'readonly') {
			return [];
		}
		const state = await this.probe.inspect(folder);
		if (!state.isRepository) {
			return [`Workspace "${folder}" is not a git repository: nothing records what the steps change there.`];
		}
		if (state.dirty) {
			return [
				`Workspace "${folder}" has uncommitted changes: the steps start from that state, and their changes are mixed with it.`,
			];
		}
		return [];
	}
}
