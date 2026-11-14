import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ResolvedHostExecutable } from './HostToolExecutableResolver';

export interface HostToolWorkspaceExecutableWarningOptions {
	stepId: string;
	/** One resolved executable per tool id, from run start. */
	executables: ReadonlyMap<string, ResolvedHostExecutable>;
	workspaceDir: string;
	/** Defaults to the real platform: Windows compares paths without regard to case. */
	platform?: NodeJS.Platform;
}

/**
 * F-16 residual: the (size, mtime) check cannot stop a writer who restores both, and the model can write the workspace.
 * An executable that lives inside the workspace could therefore be replaced by the model between calls. This is a
 * warning only (not an error: a project-local tool is legitimate), one line per such tool, written at step start.
 */
export class HostToolWorkspaceExecutableWarning {
	static find(options: HostToolWorkspaceExecutableWarningOptions): string[] {
		const platform = options.platform ?? process.platform;
		// The path rules of the platform, not of the machine running the code: tests inject the other one.
		const pathApi = platform === 'win32' ? path.win32 : path.posix;
		const workspaces = HostToolWorkspaceExecutableWarning.spellings(options.workspaceDir, pathApi);
		const warnings: string[] = [];
		for (const [toolId, executable] of options.executables) {
			const files = HostToolWorkspaceExecutableWarning.spellings(executable.absolutePath, pathApi);
			const inside = files.some(file =>
				workspaces.some(workspace => HostToolWorkspaceExecutableWarning.contains(workspace, file, pathApi))
			);
			if (!inside) {
				continue;
			}
			warnings.push(
				`[host-tool] WARNING Step '${options.stepId}' tool '${toolId}': executable '${executable.absolutePath}' is inside the workspace '${options.workspaceDir}'. The model can write the workspace, so it could replace the executable between calls; the size and modified-time check does not stop a writer who restores both. Fix: use an executable outside the workspace.`
			);
		}
		return warnings;
	}

	/** The lexical absolute path and the real one (links followed): either may be what the model writes through. */
	private static spellings(target: string, pathApi: path.PlatformPath): string[] {
		const lexical = pathApi.resolve(target);
		try {
			return [lexical, fs.realpathSync(lexical)];
		} catch {
			// A path that does not exist (yet) has no other spelling; the lexical one is still compared.
			return [lexical];
		}
	}

	private static contains(directory: string, file: string, pathApi: path.PlatformPath): boolean {
		const caseInsensitive = pathApi === path.win32;
		const [from, to] = caseInsensitive ? [directory.toLowerCase(), file.toLowerCase()] : [directory, file];
		const relative = pathApi.relative(from, to);
		const leavesDirectory = relative === '..' || relative.startsWith(`..${pathApi.sep}`);
		return relative !== '' && !leavesDirectory && !pathApi.isAbsolute(relative);
	}
}
