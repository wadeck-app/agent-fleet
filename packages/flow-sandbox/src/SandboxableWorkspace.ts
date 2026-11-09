import * as fs from 'node:fs';
import * as path from 'node:path';

import { RunMetaDirectory } from './RunMetaDirectory';
import { SandboxError } from './SandboxError';

/**
 * The workspace provider kinds the sandbox worker accepts: declared in the plugin manifest and on the instance (plugin/plugin.config.js,
 * kept equal by a test), checked by the core at run start (WORKSPACE_KIND_NOT_ACCEPTED). The kind is coarse: the layout check below stays as
 * defence in depth (a pool slot that contains the project is still refused).
 */
export const SANDBOX_WORKSPACE_KINDS: readonly string[] = ['pool'];

/** What the wrapper needs of an assignment's `executionContext` to decide which directories become mounts. */
export interface SandboxableContext {
	workspaceDir: string;
	outputsDir?: unknown;
	workspaceReadOnly?: unknown;
}

/** Resolves links and junctions of an existing directory to its real path (`fs.realpathSync.native`, without a `\\?\` prefix). */
export type DirectoryResolver = (existingDirectory: string) => string;

export const realDirectoryResolver: DirectoryResolver = existingDirectory => {
	const real = fs.realpathSync.native(existingDirectory);
	return /^\\\\\?\\[A-Za-z]:\\/.test(real) ? real.slice(4) : real;
};

/** The directories of a run: the spelling the engine uses, and the resolved real directories that are checked AND mounted. */
export interface MountPaths {
	workspaceDir: string;
	workspaceMetaDir: string;
	resolved: { workspaceDir: string; workspaceMetaDir: string };
}

/**
 * Which workspaces a sandboxed worker accepts, and where the run's `.meta` is.
 *
 * Only `workspace: pool` is accepted. The `in-place` provider hands the sandbox the project folder itself, `<project>/.flow` (flow
 * definitions, the metas and outputs of other runs) and `.git/hooks` included, and puts the run's `.meta` inside it. `readonly` is the
 * same folder with an advisory flag. `worktree` has a `.git` FILE whose gitdir lies outside the mounts, so git cannot work in the
 * sandbox.
 *
 * The real check is the layout, not the provider name: the run's `.meta` (derived from `outputsDir`, see {@link RunMetaDirectory}) must
 * lie OUTSIDE the workspace once both are resolved through links and junctions. That also refuses a pool slot that contains the
 * project, and a meta reached through a link into the workspace. The provider name (only the read-only flag is in the context) just
 * makes the message better.
 */
export class SandboxableWorkspace {
	/** The run's meta directory; throws a SandboxError saying what to change when this workspace must not be given to a sandbox. */
	static metaDirectoryFor(context: SandboxableContext): string {
		return SandboxableWorkspace.mountPathsFor(context).workspaceMetaDir;
	}

	/**
	 * The run's directories with the layout check done on their RESOLVED form, and those resolved directories returned to be mounted:
	 * each is resolved exactly once, so a link swapped after this call cannot change what the check saw and what is mounted
	 * (nothing is resolved again between the check and `sbx create`; the mount is given the real path).
	 */
	static mountPathsFor(context: SandboxableContext, resolver: DirectoryResolver = realDirectoryResolver): MountPaths {
		const metaDir = RunMetaDirectory.of(context);
		const realWorkspace = SandboxableWorkspace.resolveReal(context.workspaceDir, resolver);
		const realMeta = SandboxableWorkspace.resolveReal(metaDir, resolver);
		const workspace = SandboxableWorkspace.comparable(realWorkspace);
		const meta = SandboxableWorkspace.comparable(realMeta);

		if (SandboxableWorkspace.isInside(meta, workspace)) {
			throw new SandboxError(
				'invalid-argument',
				`A sandboxed worker needs workspace: pool, the in-place workspace exposes <project>/.flow and .git/hooks to the sandbox. ` +
					`The run's .meta directory ${metaDir} lies inside its workspace ${context.workspaceDir}, so the sandbox would see the project's .flow ` +
					'folder (flow definitions, the outputs of other runs) and its git hooks. Declare "workspace: pool" in the flow (see the schema reference, "pool"), ' +
					'or remove the sandbox requirement (requires: [sandbox]).'
			);
		}
		if (context.workspaceReadOnly === true) {
			throw new SandboxError(
				'invalid-argument',
				`A sandboxed worker needs workspace: pool, not readonly: the readonly provider exposes the project folder (<project>/.flow and .git/hooks) to the sandbox ` +
					`(workspace ${context.workspaceDir}). Declare "workspace: pool" in the flow, or remove the sandbox requirement (requires: [sandbox]).`
			);
		}
		if (SandboxableWorkspace.isFile(path.join(context.workspaceDir, '.git'))) {
			throw new SandboxError(
				'invalid-argument',
				`The workspace ${context.workspaceDir} is a git worktree or submodule (.git is a file): the worktree provider is not supported for a ` +
					'sandboxed worker, because its gitdir lies outside the mounts and git cannot work in the sandbox. Declare "workspace: pool" in the flow.'
			);
		}
		return {
			workspaceDir: context.workspaceDir,
			workspaceMetaDir: metaDir,
			resolved: { workspaceDir: realWorkspace, workspaceMetaDir: realMeta },
		};
	}

	/** Case-insensitive on Windows, for comparisons only (never for a path that is mounted). */
	private static comparable(resolved: string): string {
		return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
	}

	/** realpath of the longest existing ancestor (links and junctions resolved), plus the part that does not exist yet. */
	private static resolveReal(target: string, resolver: DirectoryResolver): string {
		const missing: string[] = [];
		let existing = path.resolve(target);
		while (!fs.existsSync(existing)) {
			const parent = path.dirname(existing);
			if (parent === existing) break;
			missing.unshift(path.basename(existing));
			existing = parent;
		}
		const real = fs.existsSync(existing) ? resolver(existing) : existing;
		return path.join(real, ...missing);
	}

	/** `candidate` is `root` or below it. */
	private static isInside(candidate: string, root: string): boolean {
		const relative = path.relative(root, candidate);
		return (
			relative === '' ||
			(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
		);
	}

	private static isFile(file: string): boolean {
		try {
			return fs.lstatSync(file).isFile();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
			throw error;
		}
	}
}
