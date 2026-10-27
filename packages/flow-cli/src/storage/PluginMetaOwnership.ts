import { isExecutionId } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File written in a plugin workspace `.meta` directory that the daemon itself created. Its content is the id of the
 * execution that owns the directory; the pruner deletes the directory only when this equals the id of the record
 * being deleted (see PluginMetaCleaner).
 */
export const PLUGIN_META_MARKER_FILE = '.flow-plugin-meta-owner';

/**
 * Creates the `<workspace>.meta` directory of a plugin-provided workspace and decides whether the daemon owns it.
 *
 * `<handle.path>.meta` can already exist as a directory of the user (or, with the `none` provider, from an earlier
 * run), so a recursive mkdir alone cannot tell "I created it" from "it was there". Only a directory created here, or
 * one already carrying the marker of an earlier daemon run, is claimed; anything else is used but never claimed, so
 * it can never be pruned.
 */
export class PluginMetaOwnership {
	/**
	 * Ensures `<metaDir>/outputs` exists.
	 *
	 * @returns true when the daemon owns `metaDir` (marker now holds `executionId`), false when it is somebody else's.
	 */
	create(metaDir: string, executionId: string): boolean {
		fs.mkdirSync(path.dirname(metaDir), { recursive: true });
		let owned: boolean;
		try {
			// Not recursive on purpose: EEXIST is the proof that the leaf was not ours to create.
			fs.mkdirSync(metaDir);
			owned = true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw err;
			}
			if (fs.lstatSync(metaDir).isSymbolicLink()) {
				// Symlink or junction: its target is not ours, whatever marker it holds. The run goes on with an unowned (never pruned) .meta.
				console.warn(
					`[PluginMetaOwnership] '${metaDir}' is a symbolic link or junction: it will not be marked or pruned with the execution record. ` +
						`To let the daemon manage this directory, remove the link (delete only the link, not its target) so that it can create a real directory.`
				);
				owned = false;
			} else {
				// The latest run owns a shared directory: an older record's marker no longer matches, so only the newest run can prune it.
				const marker = this.readMarker(metaDir);
				owned = marker !== undefined && isExecutionId(marker);
			}
		}
		fs.mkdirSync(path.join(metaDir, 'outputs'), { recursive: true });
		if (owned) {
			fs.writeFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), executionId);
		}
		return owned;
	}

	/** The owner written in `metaDir`, or undefined when there is no (readable) marker. */
	readMarker(metaDir: string): string | undefined {
		try {
			return fs.readFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), 'utf8');
		} catch {
			return undefined;
		}
	}
}
