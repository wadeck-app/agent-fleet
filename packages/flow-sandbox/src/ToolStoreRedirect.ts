import * as fs from 'node:fs';
import * as path from 'node:path';

import { type ModelTool, requireModelTool } from './ModelTool';
import type { PathTranslator } from './PathTranslator';

export interface ToolStoreRedirectOptions {
	translator: PathTranslator;
	/** Host directory mounted as the run's `.meta` (the second mount of the translator). */
	workspaceMetaDir: string;
	/** `win32` builds Windows paths; must be the platform the translator was built with. */
	platform: NodeJS.Platform;
	/**
	 * Codex clones a plugins repository at its first session start (5436 files, 94 MB measured) unless
	 * `--disable plugins` is passed. Explicit, no default: see the README for what was verified.
	 */
	codexDisablePlugins: boolean;
	/** Creates a host directory and its parents. Default: `fs.mkdirSync(path, { recursive: true })`. */
	makeDirectory?: (hostPath: string) => void;
}

/** What a step needs to run one tool with its session store on the run's mount. */
export interface ToolStore {
	tool: ModelTool;
	/** Host directory of the store, inside the run's `.meta`. */
	hostDirectory: string;
	/** The same directory as the sandbox sees it. */
	sandboxDirectory: string;
	/** Environment variables for the tool process. */
	env: Readonly<Record<string, string>>;
	/** Options for `codex exec` (empty for the other tools). They go right after `exec`, before any `resume`. */
	codexExecOptions: readonly string[];
}

const STORE_VARIABLE: Record<ModelTool, string> = {
	claude: 'CLAUDE_CONFIG_DIR',
	codex: 'CODEX_HOME',
	opencode: 'XDG_DATA_HOME',
};

/**
 * Puts each tool's session store under `<meta>/sessions/<tool>` so the session survives the sandbox and
 * can be resumed from a new one (verified for claude, opencode and codex, see the research findings).
 *
 * - Claude: `CLAUDE_CONFIG_DIR`. OpenCode: `XDG_DATA_HOME` (its SQLite database and WAL files land there).
 * - Codex: `CODEX_HOME`. The directory MUST exist first, otherwise Codex stops with "path does not exist".
 *   A redirected Codex no longer reads the image's default config, so what the run needs is passed with `-c`:
 *   `sandbox_mode` and `approval_policy` (the VM is the sandbox), and optionally `--disable plugins`.
 * - Every path goes through PathTranslator, so a store outside the two mounts is refused.
 */
export class ToolStoreRedirect {
	private readonly pathModule: path.PlatformPath;
	private readonly makeDirectory: (hostPath: string) => void;

	constructor(private readonly options: ToolStoreRedirectOptions) {
		this.pathModule = options.platform === 'win32' ? path.win32 : path.posix;
		this.makeDirectory = options.makeDirectory ?? (hostPath => void fs.mkdirSync(hostPath, { recursive: true }));
	}

	/** Creates the host directory and returns the environment and options for the tool. */
	prepare(tool: string): ToolStore {
		const known = requireModelTool(tool);
		const hostDirectory = this.pathModule.join(this.options.workspaceMetaDir, 'sessions', known);
		// Throws path-outside-mounts before anything is created when the store would leave the mounts.
		const sandboxDirectory = this.options.translator.toSandbox(hostDirectory, `${known} session store`);
		this.makeDirectory(hostDirectory);
		return {
			tool: known,
			hostDirectory,
			sandboxDirectory,
			env: { [STORE_VARIABLE[known]]: sandboxDirectory },
			codexExecOptions: known === 'codex' ? this.codexOptions() : [],
		};
	}

	private codexOptions(): string[] {
		const options = ['-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"'];
		if (this.options.codexDisablePlugins) options.push('--disable', 'plugins');
		return options;
	}
}
