import * as fs from 'node:fs';
import * as path from 'node:path';

import { PluginMetaOwnership } from './PluginMetaOwnership';

/** A `.meta` directory named by an execution record that is being deleted. */
export interface PluginMetaCandidate {
	executionId: string;
	pluginMetaDir: string;
}

export type PluginMetaCleanResult =
	'removed' | 'already-gone' | 'kept-referenced' | 'kept-active' | 'kept-marker-mismatch' | 'refused' | 'failed';

export interface PluginMetaCleanOutcome {
	pluginMetaDir: string;
	result: PluginMetaCleanResult;
}

const META_SUFFIX = '.meta';

/** Real path, or the resolved path when it cannot be resolved (missing): `realpath.native` also fixes Windows case and 8.3 names. */
function canonical(target: string): string {
	try {
		return fs.realpathSync.native(target);
	} catch {
		return path.resolve(target);
	}
}

/** Windows paths are case-insensitive; the comparison must be too. */
function sameName(left: string, right: string): boolean {
	return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * Deletes the `.meta` directories of plugin-provided workspaces whose execution record expired.
 *
 * Retention is the record's (`logs.retainDays`, age only). Known leaks, all in the safe direction: a `.meta` created
 * before this feature existed has no record naming it and is never pruned (no migration, no report); a lost record
 * leaves its `.meta`. Deleting a `.meta` removes its `sessions/` too: resuming that old execution is no longer
 * possible, same as for the built-in workspace pruner.
 *
 * A directory is deleted only when ALL hold: no live record and no active execution uses the same real path; the name
 * ends with `.meta`; it is a real directory, not a link, whose real path is the real parent plus its name; and its
 * marker equals the deleted record's execution id. Failures warn and never throw.
 */
export class PluginMetaCleaner {
	private readonly ownership = new PluginMetaOwnership();

	constructor(
		private readonly warn: (message: string) => void = message => process.stderr.write(`${message}\n`),
		// Injectable so a removal failure can be tested; rmSync unlinks a link inside the tree without following it.
		private readonly removeTree: (target: string) => void = target =>
			fs.rmSync(target, { recursive: true, force: true })
	) {}

	clean(
		candidates: readonly PluginMetaCandidate[],
		liveReferences: readonly string[],
		activeDirs: readonly string[]
	): PluginMetaCleanOutcome[] {
		const live = new Set(liveReferences.map(canonical));
		const active = new Set(activeDirs.map(canonical));
		return candidates.map(candidate => ({
			pluginMetaDir: candidate.pluginMetaDir,
			result: this.cleanOne(candidate, live, active),
		}));
	}

	private cleanOne(candidate: PluginMetaCandidate, live: Set<string>, active: Set<string>): PluginMetaCleanResult {
		const { pluginMetaDir, executionId } = candidate;
		try {
			let stat: fs.Stats;
			try {
				stat = fs.lstatSync(pluginMetaDir);
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
					return 'already-gone';
				}
				throw err;
			}
			const real = canonical(pluginMetaDir);
			if (active.has(real)) {
				return 'kept-active';
			}
			if (live.has(real)) {
				return 'kept-referenced';
			}
			const refusal = this.refusalReason(pluginMetaDir, real, stat);
			if (refusal !== undefined) {
				this.warn(
					`[ExecutionPruner] not deleting ${pluginMetaDir} (workspace metadata of execution ${executionId}): ${refusal}. ` +
						`It is left in place; delete it manually if it is no longer needed.`
				);
				return 'refused';
			}
			if (this.ownership.readMarker(pluginMetaDir)?.trim() !== executionId) {
				return 'kept-marker-mismatch';
			}
			this.removeTree(real);
			return 'removed';
		} catch (err) {
			this.warn(
				`[ExecutionPruner] could not delete ${pluginMetaDir} (workspace metadata of execution ${executionId}): ${String(err)}. ` +
					`Delete the directory manually (it only holds outputs and sessions of that execution) or check its permissions and that nothing uses it.`
			);
			return 'failed';
		}
	}

	/** Why this path must not be deleted, or undefined when it is a plain `.meta` directory. */
	private refusalReason(pluginMetaDir: string, real: string, stat: fs.Stats): string | undefined {
		const name = path.basename(pluginMetaDir);
		if (!name.endsWith(META_SUFFIX) || name === META_SUFFIX) {
			return `its name does not end with '${META_SUFFIX}'`;
		}
		if (stat.isSymbolicLink()) {
			return 'it is a link (symlink or junction), not a directory';
		}
		if (!stat.isDirectory()) {
			return 'it is not a directory';
		}
		const expectedParent = canonical(path.dirname(pluginMetaDir));
		if (path.dirname(real) !== expectedParent || !sameName(path.basename(real), name)) {
			return `its real path (${real}) is not its real parent plus its name`;
		}
		return undefined;
	}
}
