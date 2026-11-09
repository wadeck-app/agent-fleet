import fs from 'node:fs';
import path from 'node:path';

import { PathTranslator } from './PathTranslator';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxMount } from './SandboxRuntime';

export interface RunMountsOptions {
	/** Host directory of the run's workspace. */
	workspaceDir: string;
	/** Host directory of the run's `.meta` (outputs, sessions). */
	workspaceMetaDir: string;
	platform: NodeJS.Platform;
	log: SandboxLog;
	/** The user's own project directory, when the wrapper knows it (manual mode); see the heuristic below. */
	projectDir?: string;
	/**
	 * Whole-run read-only (`fs=readonly-enforced`): the workspace is a `:ro` SECONDARY mount and `.meta` is the read/write PRIMARY one
	 * (sbx needs the first mount read/write). Default false: the workspace is the read/write primary.
	 */
	readOnlyWorkspace?: boolean;
}

/**
 * The two mounts of a run's sandbox: exactly its workspace and its `.meta` directory, nothing else
 * (sibling runs stay invisible). Every `cwd` handed to the sandbox and every path coming back from it goes
 * through here (T-04, T-12).
 *
 * Containment = PathTranslator (lexical: `..` refused, drive/case rules) PLUS a file system check done here:
 * the mount roots and every EXISTING component below them down to the path must not be a symbolic link or
 * a Windows junction (`lstat`, never followed), otherwise the sandbox could be made to see or write outside
 * the two directories. Components that do not exist yet cannot be links. Limit: this is a check at one
 * moment; a link planted by the agent inside the writable mount after the check is caught by the next check
 * of the same path, not before. Links ABOVE the mount roots (a symlinked parent directory) are not examined.
 *
 * Warnings (logged once at construction, also kept in `warnings`):
 * - project directory: the workspace equals `projectDir` (same drive/case rules as the mounts). The agent can then change
 *   hooks, scripts and config that later run on the host. A `.git` DIRECTORY alone is the normal case of a pool slot (a
 *   clone) and does not warn; slots used by sandboxed runs must be dedicated to them (README, T-16).
 * - `<workspace>/.git` is a FILE: a worktree or submodule. Its `gitdir:` points outside the mounts, so git
 *   does not work inside the sandbox (unsupported, documented by Docker, untested here).
 */
export class RunMounts {
	readonly translator: PathTranslator;
	readonly warnings: readonly string[];
	/** True when the workspace is mounted `:ro` (the run requires `fs=readonly-enforced`). */
	readonly readOnlyWorkspace: boolean;
	private readonly flavor: path.PlatformPath;
	private readonly roots: readonly string[];

	constructor(private readonly options: RunMountsOptions) {
		this.flavor = options.platform === 'win32' ? path.win32 : path.posix;
		this.translator = new PathTranslator({
			workspaceDir: options.workspaceDir,
			workspaceMetaDir: options.workspaceMetaDir,
			platform: options.platform,
		});
		this.readOnlyWorkspace = options.readOnlyWorkspace === true;
		this.roots = [options.workspaceDir, options.workspaceMetaDir];
		this.requireRealDirectory(options.workspaceDir, 'workspaceDir');
		this.requireRealDirectory(options.workspaceMetaDir, 'workspaceMetaDir');
		const warnings = this.inspectWorkspace();
		for (const warning of warnings) options.log.warn(warning);
		this.warnings = warnings;
	}

	/** The workspace mount, `:ro` when the run requires `fs=readonly-enforced`. */
	workspaceMount(): SandboxMount {
		return this.readOnlyWorkspace
			? { hostPath: this.options.workspaceDir, readOnly: true }
			: { hostPath: this.options.workspaceDir };
	}

	/** The run's `.meta` mount: always read/write (outputs, session store). */
	metaMount(): SandboxMount {
		return { hostPath: this.options.workspaceMetaDir };
	}

	/**
	 * The mounts to give to `sbx create`, the first one being the primary (it must be read/write): the workspace then `.meta`, or
	 * `.meta` then the `:ro` workspace for a read-only run. Look a mount up with {@link workspaceMount} / {@link metaMount}, never by position.
	 */
	sandboxMounts(): SandboxMount[] {
		return this.readOnlyWorkspace
			? [this.metaMount(), this.workspaceMount()]
			: [this.workspaceMount(), this.metaMount()];
	}

	/** Host path -> path inside the sandbox, refusing anything outside the mounts or through a link. */
	toSandboxPath(hostPath: string, label: string): string {
		const sandboxPath = this.translator.toSandbox(hostPath, label);
		this.rejectLinks(hostPath, label);
		return sandboxPath;
	}

	/** Path reported by the sandbox -> host path, with the same guarantees. */
	toHostPath(sandboxPath: string, label: string): string {
		const hostPath = this.translator.toHost(sandboxPath, label);
		this.rejectLinks(hostPath, label);
		return hostPath;
	}

	private requireRealDirectory(directory: string, label: string): void {
		let stats: fs.Stats;
		try {
			stats = fs.lstatSync(directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new SandboxError(
					'path-outside-mounts',
					`${label} "${directory}" does not exist. Create the directory before the run's sandbox is started.`
				);
			}
			throw error;
		}
		if (stats.isSymbolicLink()) {
			throw this.linkError(label, directory, directory);
		}
		if (!stats.isDirectory()) {
			throw new SandboxError('path-outside-mounts', `${label} "${directory}" is not a directory.`);
		}
	}

	private rejectLinks(hostPath: string, label: string): void {
		const root = this.roots.find(candidate => this.isUnder(candidate, hostPath));
		if (root === undefined) {
			throw new SandboxError('path-outside-mounts', `${label} "${hostPath}" is outside the mounts.`);
		}
		let current = root;
		for (const segment of this.segmentsBelow(root, hostPath)) {
			current = this.flavor.join(current, segment);
			let stats: fs.Stats;
			try {
				stats = fs.lstatSync(current);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
				throw error;
			}
			if (stats.isSymbolicLink()) throw this.linkError(label, hostPath, current);
		}
	}

	private linkError(label: string, requested: string, link: string): SandboxError {
		return new SandboxError(
			'path-outside-mounts',
			`${label} "${requested}" goes through the symbolic link or junction "${link}". Links are never followed: ` +
				'a link inside a mount could expose files outside the run. Use the real path, or remove the link.'
		);
	}

	private isUnder(root: string, candidate: string): boolean {
		const relative = this.flavor.relative(root, candidate);
		const climbs = relative === '..' || relative.startsWith(`..${this.flavor.sep}`);
		return !climbs && !this.flavor.isAbsolute(relative);
	}

	private segmentsBelow(root: string, candidate: string): string[] {
		return this.flavor
			.relative(root, candidate)
			.split(this.flavor.sep)
			.filter(segment => segment !== '');
	}

	private sameDirectory(a: string, b: string): boolean {
		const left = this.flavor.resolve(a);
		const right = this.flavor.resolve(b);
		return this.options.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
	}

	private inspectWorkspace(): string[] {
		const warnings: string[] = [];
		const { workspaceDir, projectDir } = this.options;
		const gitEntry = this.gitEntryKind(workspaceDir);
		if (projectDir !== undefined && this.sameDirectory(workspaceDir, projectDir)) {
			warnings.push(
				`The sandbox workspace "${workspaceDir}" IS your project directory (projectDir option): the agent gets write access to your real files, including git hooks and scripts that later run on the host. Use a pool slot dedicated to sandboxed runs instead.`
			);
		}
		if (gitEntry === 'file') {
			warnings.push(
				`The sandbox workspace "${workspaceDir}" is a git worktree or submodule (.git is a file): its gitdir lives outside the mounts, so git commands will not work inside the sandbox (unsupported).`
			);
		}
		return warnings;
	}

	private gitEntryKind(workspaceDir: string): 'directory' | 'file' | undefined {
		try {
			const stats = fs.lstatSync(this.flavor.join(workspaceDir, '.git'));
			if (stats.isDirectory()) return 'directory';
			if (stats.isFile()) return 'file';
			return undefined;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
			throw error;
		}
	}
}
