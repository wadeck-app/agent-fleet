import type { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { JsonObject } from './HarnessMessages';

export interface ReturnedPathsResult {
	meta: JsonObject;
	/** Entries removed from `files_written` because they are outside the mounts. */
	removed: string[];
}

/**
 * Paths a step reports back (`meta.session_file`, `meta.files_written`) are sandbox paths. The daemon reads them
 * on the HOST, so they are translated to host paths, and only paths inside the run's two mounts survive:
 * - `session_file` outside the mounts, through a link, or not a path at all: the whole result is refused (a
 *   SandboxError of kind `path-outside-mounts`), because the daemon would act on a path the sandbox chose;
 * - `files_written` entries outside the mounts (`/tmp/x`, `/home/agent/...`) are removed from the list and
 *   reported; `files_written_count` keeps the true count.
 */
export class ReturnedPaths {
	constructor(private readonly mounts: RunMounts) {}

	translate(meta: JsonObject): ReturnedPathsResult {
		const translated: JsonObject = { ...meta };
		const removed: string[] = [];

		if (meta['session_file'] !== undefined) {
			const sessionFile = meta['session_file'];
			if (typeof sessionFile !== 'string') {
				throw new SandboxError(
					'path-outside-mounts',
					`The sandbox reported a session_file that is not a path (${JSON.stringify(sessionFile)}).`
				);
			}
			// '' is the engine's "no session file" (codex and opencode keep a session id, not a file): nothing to translate.
			if (sessionFile !== '')
				translated['session_file'] = this.mounts.toHostPath(sessionFile, 'meta.session_file');
		}

		const filesWritten = meta['files_written'];
		if (filesWritten !== undefined) {
			if (!Array.isArray(filesWritten) || filesWritten.some(entry => typeof entry !== 'string')) {
				throw new SandboxError(
					'path-outside-mounts',
					'The sandbox reported a files_written that is not a list of paths.'
				);
			}
			const kept: string[] = [];
			for (const entry of filesWritten as string[]) {
				try {
					kept.push(this.mounts.toHostPath(entry, 'meta.files_written'));
				} catch (error) {
					if (!(error instanceof SandboxError) || error.kind !== 'path-outside-mounts') throw error;
					removed.push(entry);
				}
			}
			translated['files_written'] = kept;
		}
		return { meta: translated, removed };
	}
}
